// Runs Vultrom_BP/scripts/main.js against a mock @minecraft/server and a model of Bedrock
// component groups (adding a group overwrites its components, removing one deletes them,
// base components included; events apply "remove" before "add").
// Run from the repo root: node tools/mock-test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const JEWELER_JSON = JSON.parse(read("Vultrom_BP/entities/jeweler.json"))["minecraft:entity"];
const clone = (v) => JSON.parse(JSON.stringify(v));
let failures = 0;
function check(name, fn) {
	try {
		fn();
		console.log(`ok   ${name}`);
	} catch (err) {
		failures++;
		console.log(`FAIL ${name}\n     ${err.message.split("\n").join("\n     ")}`);
	}
}

// ---------- entity engine ----------
class EntityModel {
	constructor(def) {
		this.def = def;
		this.components = clone(def.components);
		this.groups = new Set();
		this.schedulerArmed = false;
	}
	addGroup(name) {
		const group = this.def.component_groups[name];
		assert.ok(group, `unknown component group ${name}`);
		for (const [k, v] of Object.entries(group)) this.components[k] = clone(v);
		this.groups.add(name);
		if ("minecraft:scheduler" in group) this.schedulerArmed = true;
	}
	removeGroup(name) {
		const group = this.def.component_groups[name];
		assert.ok(group, `unknown component group ${name}`);
		for (const k of Object.keys(group)) delete this.components[k];
		this.groups.delete(name);
	}
	passes(filter) {
		if (!filter) return true;
		if (filter.all_of) return filter.all_of.every((f) => this.passes(f));
		if (filter.any_of) return filter.any_of.some((f) => this.passes(f));
		if (filter.test === "has_component") {
			const has = filter.value in this.components;
			return filter.operator === "!=" ? !has : has;
		}
		if (filter.test === "has_biome_tag") return filter.operator === "!=";
		if (filter.test === "is_difficulty") return false;
		if (filter.test === "hourly_clock_time") {
			const ops = { ">=": (a, b) => a >= b, "<": (a, b) => a < b };
			return ops[filter.operator](this.clock, filter.value);
		}
		throw new Error(`filter ${filter.test} not modelled`);
	}
	applyResponse(r) {
		if (!this.passes(r.filters)) return;
		for (const g of r.remove?.component_groups ?? []) this.removeGroup(g);
		for (const g of r.add?.component_groups ?? []) this.addGroup(g);
		if (r.randomize) this.applyResponse(r.randomize[0]);
		for (const step of r.sequence ?? []) this.applyResponse(step);
	}
	trigger(event) {
		const r = this.def.events[event];
		assert.ok(r, `unknown event ${event}`);
		this.applyResponse(r);
	}
	/** Fires the scheduler's matching event, like the engine does after (re)adding it. */
	runScheduler(clock) {
		if (!this.schedulerArmed || !("minecraft:scheduler" in this.components)) return;
		this.clock = clock;
		for (const s of this.components["minecraft:scheduler"].scheduled_events) {
			if (this.passes(s.filters)) {
				this.trigger(s.event);
				break;
			}
		}
		this.schedulerArmed = false;
	}
	snapshot() {
		return { groups: [...this.groups].sort(), components: clone(this.components) };
	}
}

function spawnModel(def, clock = 2000) {
	const m = new EntityModel(def);
	m.trigger("minecraft:entity_spawned");
	m.runScheduler(clock);
	return m;
}

// ---------- mock @minecraft/server ----------
function makeServer() {
	const subs = {};
	const sub = (name) => ({ subscribe: (fn) => (subs[name] ??= []).push(fn) });
	const fire = (name, ev) => (subs[name] ?? []).forEach((fn) => fn(ev));
	const jobs = [];
	const system = {
		currentTick: 0,
		runInterval: (fn, every = 1) => jobs.push({ fn, every, next: system.currentTick + every }),
		runTimeout: (fn, delay = 1) => jobs.push({ fn, once: true, next: system.currentTick + Math.max(1, delay) }),
		run: (fn) => jobs.push({ fn, once: true, next: system.currentTick + 1 })
	};
	function tick(n = 1) {
		for (let i = 0; i < n; i++) {
			system.currentTick++;
			for (const job of [...jobs]) {
				if (job.next > system.currentTick) continue;
				if (job.once) jobs.splice(jobs.indexOf(job), 1);
				else job.next += job.every;
				job.fn();
			}
		}
	}
	const NON_STACKABLE = new Set(["vultrom:camera", "vultrom:photo"]);
	class ItemStack {
		constructor(typeId, amount = 1) {
			this.typeId = typeId;
			this.amount = amount;
			this.lore = [];
			this.dyn = {};
		}
		setLore(l) {
			assert.ok(l.length <= 20, "lore has more than 20 lines");
			for (const line of l) assert.ok(line.length <= 50, `lore line over 50 characters: ${line}`);
			this.lore = l;
		}
		getLore() {
			return this.lore;
		}
		getComponent() {
			return undefined;
		}
		setDynamicProperty(k, v) {
			if (!NON_STACKABLE.has(this.typeId)) throw new Error(`${this.typeId} is stackable`);
			this.dyn[k] = v;
		}
		getDynamicProperty(k) {
			return this.dyn[k];
		}
	}
	const blocks = new Map();
	const spawnedItems = [];
	const entities = [];
	const sounds = [];
	const scene = { at: undefined, rays: 0, slowRayMs: 0 };
	const dimension = {
		id: "minecraft:overworld",
		getBlock: ({ x, y, z }) => {
			const typeId = blocks.get(`${x},${y},${z}`) ?? (y < 0 ? "minecraft:deepslate" : "minecraft:stone");
			return { typeId, location: { x, y, z }, isAir: typeId === "minecraft:air", dimension, isValid: () => true };
		},
		setBlockType: ({ x, y, z }, id) => blocks.set(`${x},${y},${z}`, id),
		getEntities: (q) =>
			entities.filter(
				(e) =>
					(!q.type || e.typeId === q.type) &&
					e.isValid() &&
					(!q.location || Math.hypot(e.location.x - q.location.x, e.location.y - q.location.y, e.location.z - q.location.z) <= q.maxDistance)
			),
		getBlockFromRay: (o, d, opts = {}) => {
			scene.rays++;
			if (scene.slowRayMs) for (const end = performance.now() + scene.slowRayMs; performance.now() < end; );
			return scene.at ? voxelRay(scene.at, o, d, opts) : undefined;
		},
		spawnEntity: (typeId, location) => {
			const e = makeEntity(typeId, { ...location });
			e.dimension = dimension;
			entities.push(e);
			return e;
		},
		spawnItem: (stack, loc) => spawnedItems.push({ stack, loc }),
		spawnParticle() {},
		playSound: (id, loc) => sounds.push(id)
	};
	const worldDyn = {};
	const players = [];
	const forms = [];
	const ui = {
		/** Answers each shown form; returns an ActionFormResponse-like object. */
		respond: () => ({ canceled: true, cancelationReason: "UserClosed" }),
		forms
	};
	class ActionFormData {
		constructor() {
			this.buttons = [];
		}
		title(t) {
			this.titleText = t;
			return this;
		}
		body(b) {
			this.bodyText = b;
			return this;
		}
		button(label, icon) {
			this.buttons.push({ label, icon });
			return this;
		}
		show(player) {
			forms.push(this);
			return Promise.resolve(ui.respond(this, player));
		}
	}
	ui.module = { ActionFormData, FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" } };
	const known = new Set(["vultrom:sapphire_ore", "vultrom:ruby_ore", "vultrom:deepslate_ruby_ore", "vultrom:gemstone_cutter"]);
	const server = {
		world: {
			beforeEvents: { playerInteractWithBlock: sub("pib"), playerInteractWithEntity: sub("pie"), chatSend: sub("chat") },
			afterEvents: { playerBreakBlock: sub("break"), entityLoad: sub("load"), itemUse: sub("use"), entityHitEntity: sub("hit") },
			getAllPlayers: () => players,
			getDimension: () => dimension,
			playSound() {},
			time: 6000,
			getTimeOfDay() {
				return this.time;
			},
			getDay: () => 4,
			getAbsoluteTime: () => 4 * 24000 + 6000,
			getDynamicProperty: (k) => worldDyn[k],
			setDynamicProperty: (k, v) => (worldDyn[k] = v)
		},
		system,
		BlockTypes: { get: (id) => (known.has(id) ? { id } : undefined) },
		ItemStack,
		GameMode: { creative: "creative", survival: "survival" }
	};
	return { server, ui, fire, tick, system, dimension, entities, players, blocks, spawnedItems, sounds, scene, worldDyn };
}

// ---------- voxel raycast for the Camera (getBlockFromRay) ----------
const LIQUIDS = new Set(["minecraft:water", "minecraft:lava"]);
const PASSABLE = new Set(["minecraft:short_grass", "minecraft:poppy", "minecraft:dandelion"]);
/** Amanatides–Woo walk through `at(x, y, z)` (block id or undefined for air), like getBlockFromRay. */
function voxelRay(at, o, d, { includeLiquidBlocks = false, includePassableBlocks = false, maxDistance = 64, excludeTypes = [] }) {
	const pos = [Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)];
	const org = [o.x, o.y, o.z];
	const dir = [d.x, d.y, d.z];
	const step = dir.map(Math.sign);
	const tDelta = dir.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
	const tMax = dir.map((v, i) => (v === 0 ? Infinity : ((v > 0 ? pos[i] + 1 - org[i] : org[i] - pos[i]) * tDelta[i])));
	const ENTER = [["West", "East"], ["Down", "Up"], ["North", "South"]];
	let face = "Up";
	let t = 0;
	while (t <= maxDistance) {
		const id = at(pos[0], pos[1], pos[2]);
		if (id && (includeLiquidBlocks || !LIQUIDS.has(id)) && (includePassableBlocks || !PASSABLE.has(id)) && !excludeTypes.includes(id)) {
			const p = org.map((v, i) => v + dir[i] * t - pos[i]);
			return {
				block: { typeId: id, location: { x: pos[0], y: pos[1], z: pos[2] } },
				face,
				faceLocation: { x: p[0], y: p[1], z: p[2] }
			};
		}
		const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
		t = tMax[axis];
		tMax[axis] += tDelta[axis];
		pos[axis] += step[axis];
		face = ENTER[axis][step[axis] > 0 ? 0 : 1];
	}
	return undefined;
}

let loadCount = 0;
async function loadScript(env) {
	globalThis.__mc = env.server;
	globalThis.__ui = env.ui.module;
	const dir = mkdtempSync(join(tmpdir(), `vultrom-${loadCount++}-`));
	for (const name of readdirSync(join(ROOT, "Vultrom_BP/scripts"))) {
		const src = read(`Vultrom_BP/scripts/${name}`)
			.replace(/^import \{([^}]+)\} from "@minecraft\/server";/gm, "const {$1} = globalThis.__mc;")
			.replace(/^import \{([^}]+)\} from "@minecraft\/server-ui";/gm, "const {$1} = globalThis.__ui;");
		writeFileSync(join(dir, name), src);
	}
	writeFileSync(join(dir, "package.json"), '{"type":"module"}');
	const origLog = console.log;
	console.log = () => {};
	try {
		await import(pathToFileURL(join(dir, "main.js")).href);
	} finally {
		console.log = origLog;
	}
}

let entityIds = 0;
function makeEntity(typeId, location) {
	return {
		id: `e${entityIds++}`,
		typeId,
		location,
		valid: true,
		nameTag: "",
		isValid() {
			return this.valid;
		},
		remove() {
			this.valid = false;
		},
		props: {},
		dyn: {},
		rot: { x: 0, y: 90 },
		setRotation(r) {
			this.rot = r;
		},
		getRotation() {
			return this.rot;
		},
		triggerEvent() {},
		getProperty(n) {
			return this.props[n];
		},
		setProperty(n, v) {
			this.props[n] = v;
		},
		getDynamicProperty(k) {
			return this.dyn[k];
		},
		setDynamicProperty(k, v) {
			this.dyn[k] = v;
		}
	};
}

function makeJeweler(env, model, id = "j1") {
	const props = { "vultrom:held_gem": 0, "vultrom:celebrating": false };
	const e = {
		id,
		typeId: "vultrom:jeweler",
		model,
		props,
		location: { x: 2, y: 64, z: 0 },
		dimension: env.dimension,
		isOnGround: true,
		valid: true,
		isValid() {
			return this.valid;
		},
		triggerEvent(ev) {
			model.trigger(ev);
		},
		getProperty: (n) => props[n],
		setProperty: (n, v) => (props[n] = v),
		applyImpulse() {},
		getRotation: () => ({ x: 0, y: 0 })
	};
	env.entities.push(e);
	return e;
}

function makePlayer(env, items) {
	const slots = [...items];
	const tags = new Set();
	const p = {
		id: "p1",
		name: "Mason",
		typeId: "minecraft:player",
		location: { x: 0, y: 64, z: 0 },
		rot: { x: 0, y: 0 },
		dimension: env.dimension,
		isSneaking: false,
		selectedSlotIndex: 0,
		messages: [],
		actionBar: [],
		fades: [],
		cooldowns: [],
		gameMode: "survival",
		isValid: () => true,
		getRotation() {
			return this.rot;
		},
		getViewDirection() {
			const pitch = (this.rot.x * Math.PI) / 180;
			const yaw = (this.rot.y * Math.PI) / 180;
			return { x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
		},
		getHeadLocation() {
			return { x: this.location.x, y: this.location.y + 1.62, z: this.location.z };
		},
		camera: { fade: (o) => p.fades.push(o) },
		startItemCooldown: (category, ticks) => p.cooldowns.push([category, ticks]),
		getGameMode() {
			return this.gameMode;
		},
		sendMessage(m) {
			this.messages.push(m);
		},
		playSound() {},
		onScreenDisplay: { setActionBar: (m) => p.actionBar.push(m) },
		hasTag: (t) => tags.has(t),
		addTag: (t) => tags.add(t),
		removeTag: (t) => tags.delete(t),
		slots,
		getComponent: (n) =>
			n === "minecraft:inventory"
				? {
						container: {
							size: 36,
							getItem: (i) => slots[i],
							setItem: (i, v) => (slots[i] = v),
							addItem: (stack) => {
								const i = slots.findIndex((s, k) => k > 0 && s === undefined);
								slots[i === -1 ? slots.length : i] = stack;
							}
						}
					}
				: undefined
	};
	env.players.push(p);
	return p;
}

const count = (p, id) => p.slots.reduce((n, s) => n + (s?.typeId === id ? s.amount : 0), 0);

// ---------- 1. entity groups: celebration round trip ----------
const before = spawnModel(JEWELER_JSON).snapshot();
check("baseline Jeweler wanders (random_stroll priority 11, speed 0.6)", () => {
	assert.deepEqual(before.components["minecraft:behavior.random_stroll"], { priority: 11, speed_multiplier: 0.6 });
	for (const g of ["vultrom:wander", "vultrom:jeweler_schedule", "wander_schedule_villager", "trade_resupply_component_group", "make_and_receive_love"]) {
		assert.ok(before.groups.includes(g), `missing ${g}`);
	}
});

check("old v0.1.7 stop event reproduces the bug (wander goal deleted)", () => {
	const old = JSON.parse(execSync("git show v0.1.7-bedrock:Vultrom_BP/entities/jeweler.json", { cwd: ROOT }).toString())["minecraft:entity"];
	const m = spawnModel(old);
	m.trigger("vultrom:start_sale_celebration");
	m.trigger("vultrom:stop_sale_celebration");
	assert.equal(m.components["minecraft:behavior.random_stroll"], undefined);
});

// ---------- 2. full script: sale → celebration → reset ----------
{
	const env = makeServer();
	await loadScript(env);
	const model = spawnModel(JEWELER_JSON);
	const jeweler = makeJeweler(env, model);
	const player = makePlayer(env, [new env.server.ItemStack("vultrom:sapphire", 2), new env.server.ItemStack("minecraft:emerald", 1)]);
	env.tick(45); // sweep's one-time load reset
	model.runScheduler(2000);
	const s0 = model.snapshot();
	check("load reset leaves a healthy Jeweler unchanged", () => assert.deepEqual(s0, before));

	env.fire("pie", { target: jeweler, player });
	env.tick(10);
	player.slots[0].amount = 1;
	player.slots[1].amount = 61;
	env.tick(4);
	check("sale makes him hold the sapphire", () => assert.equal(jeweler.props["vultrom:held_gem"], 1));
	player.location = { x: 1, y: 64, z: 0 };
	env.tick(10);
	check("closing the trade starts the celebration (fast stroll, flag on)", () => {
		assert.ok(model.groups.has("vultrom:sale_celebration"));
		assert.ok(!model.groups.has("vultrom:wander"));
		assert.equal(model.components["minecraft:behavior.random_stroll"].priority, 3);
		assert.equal(jeweler.props["vultrom:celebrating"], true);
	});
	env.tick(170);
	model.runScheduler(2000);
	check("after the 8 s celebration the component set equals the one before it", () => assert.deepEqual(model.snapshot(), s0));
	check("after the celebration held_gem and celebrating are reset", () => {
		assert.equal(jeweler.props["vultrom:held_gem"], 0);
		assert.equal(jeweler.props["vultrom:celebrating"], false);
	});

	// second sale, at night: the reset re-runs the schedule into bed, like a normal villager
	env.fire("pie", { target: jeweler, player });
	env.tick(10);
	player.slots[0].amount = 0;
	player.slots[1].amount = 120;
	env.tick(4);
	player.location = { x: 0, y: 64, z: 0 };
	env.tick(200);
	model.runScheduler(13000);
	check("celebration ending at night re-applies the bed schedule", () => {
		const night = spawnModel(JEWELER_JSON, 13000).snapshot();
		assert.deepEqual(model.snapshot(), night);
	});
}

// ---------- 3. Jewelers already stuck, and worlds saved mid-outburst ----------
for (const [label, prep, viaLoad] of [
	["stuck v0.1.7 Jeweler (wander goal deleted) is fixed by the sweep", (m) => {
		m.removeGroup("vultrom:wander");
		delete m.components["minecraft:behavior.random_stroll"];
	}, false],
	["Jeweler saved mid-outburst is fixed on entityLoad", (m) => {
		m.trigger("vultrom:start_sale_celebration");
	}, true]
]) {
	const env = makeServer();
	await loadScript(env);
	const model = spawnModel(JEWELER_JSON);
	prep(model);
	const jeweler = makeJeweler(env, model, "stuck");
	jeweler.props["vultrom:held_gem"] = 2;
	jeweler.props["vultrom:celebrating"] = viaLoad;
	makePlayer(env, []);
	if (viaLoad) env.fire("load", { entity: jeweler });
	env.tick(viaLoad ? 2 : 41);
	model.runScheduler(2000);
	check(label, () => {
		assert.deepEqual(model.snapshot(), before);
		assert.equal(jeweler.props["vultrom:held_gem"], 0);
		assert.equal(jeweler.props["vultrom:celebrating"], false);
	});
}

// ---------- 4. ruby ore, cutter, seeding, finder ----------
{
	const env = makeServer();
	await loadScript(env);
	const { ItemStack } = env.server;
	const player = makePlayer(env, [new ItemStack("vultrom:raw_ruby", 5)]);
	const tool = (typeId, ench = {}) => {
		const t = new ItemStack(typeId);
		t.getComponent = (n) => (n === "minecraft:enchantable" ? { getEnchantment: (e) => (e in ench ? { level: ench[e] } : undefined) } : undefined);
		return t;
	};
	const breakOre = (ore, item) => {
		env.spawnedItems.length = 0;
		env.fire("break", {
			brokenBlockPermutation: { type: { id: ore } },
			player,
			itemStackBeforeBreak: item,
			block: { location: { x: 0, y: -10, z: 0 } },
			dimension: env.dimension
		});
		return env.spawnedItems.map((s) => s.stack);
	};
	check("ruby ore with an iron pickaxe drops Ruby Scraps with lore", () => {
		const out = breakOre("vultrom:ruby_ore", tool("minecraft:iron_pickaxe"));
		assert.deepEqual(out.map((s) => [s.typeId, s.lore[0]]), [["vultrom:ruby_scraps", "Sad to look at"]]);
	});
	check("deepslate ruby ore by hand drops Ruby Scraps", () => {
		assert.deepEqual(breakOre("vultrom:deepslate_ruby_ore", undefined).map((s) => s.typeId), ["vultrom:ruby_scraps"]);
	});
	check("diamond pickaxe: no script drop without Fortune (loot table gives Raw Ruby)", () => {
		assert.deepEqual(breakOre("vultrom:ruby_ore", tool("minecraft:diamond_pickaxe")), []);
	});
	check("netherite Fortune III adds bonus Raw Ruby only", () => {
		let extra = 0;
		for (let i = 0; i < 200; i++) {
			for (const s of breakOre("vultrom:deepslate_ruby_ore", tool("minecraft:netherite_pickaxe", { fortune: 3 }))) {
				assert.equal(s.typeId, "vultrom:raw_ruby");
				extra += s.amount;
			}
		}
		assert.ok(extra > 100, `expected Fortune bonus, got ${extra}`);
	});
	check("sapphire ore still drops Sapphire Scraps with a stone pickaxe", () => {
		assert.deepEqual(breakOre("vultrom:sapphire_ore", tool("minecraft:stone_pickaxe")).map((s) => s.typeId), ["vultrom:sapphire_scraps"]);
	});

	const cutter = { typeId: "vultrom:gemstone_cutter", isValid: () => true, dimension: env.dimension, location: { x: 0, y: 64, z: 0 } };
	const click = (sneak) => {
		player.isSneaking = sneak;
		const ev = { block: cutter, player, itemStack: player.slots[0], isFirstEvent: true };
		env.fire("pib", ev);
		env.tick(1);
		return ev.cancel;
	};
	check("cutter: plain click cuts 1 Raw Ruby into 1 Ruby", () => {
		assert.equal(click(false), true);
		assert.equal(count(player, "vultrom:raw_ruby"), 4);
		assert.equal(count(player, "vultrom:ruby"), 1);
	});
	check("cutter: sneak cuts the whole Raw Ruby stack", () => {
		click(true);
		assert.equal(count(player, "vultrom:raw_ruby"), 0);
		assert.equal(count(player, "vultrom:ruby"), 5);
	});

	env.tick(25); // seeding around the player
	const placed = [...env.blocks.entries()];
	const byId = (id) => placed.filter(([, v]) => v === id);
	check("seeding places sapphire, ruby (stone) and deepslate ruby", () => {
		const chunks = (2 * 4 + 1) ** 2;
		const sapphire = byId("vultrom:sapphire_ore").length;
		const ruby = byId("vultrom:ruby_ore").length + byId("vultrom:deepslate_ruby_ore").length;
		console.log(`     ${chunks} chunks: ${sapphire} sapphire ore, ${byId("vultrom:ruby_ore").length} ruby ore, ${byId("vultrom:deepslate_ruby_ore").length} deepslate ruby ore`);
		assert.ok(byId("vultrom:ruby_ore").length > 0 && byId("vultrom:deepslate_ruby_ore").length > 0);
		assert.ok(ruby > sapphire * 0.8 && ruby < sapphire * 1.2, "ruby rarity should match sapphire");
		for (const [k] of byId("vultrom:deepslate_ruby_ore")) assert.ok(Number(k.split(",")[1]) < 0);
		for (const [k] of byId("vultrom:ruby_ore")) assert.ok(Number(k.split(",")[1]) >= 0);
	});
	check("sapphire veins sit where v0.1.7 put them", () => {
		const hash32 = (n) => {
			n |= 0;
			n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
			n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
			return (n ^ (n >>> 16)) >>> 0;
		};
		let rng = hash32(0 * 374761393 + 0 * 668265263 + 0x5a7f31);
		rng = hash32(rng + 0x9e3779b9);
		const x = rng % 16;
		rng = hash32(rng + 0x9e3779b9);
		const z = rng % 16;
		rng = hash32(rng + 0x9e3779b9);
		const y = -48 + (rng % 81);
		assert.equal(env.blocks.get(`${x},${y},${z}`), "vultrom:sapphire_ore");
	});
	check("/function vultrom/find_ruby reports the nearest ruby ore", () => {
		player.messages.length = 0;
		player.addTag("vultrom_find_ruby");
		env.tick(1);
		assert.match(String(player.messages[0]), /Ruby Ore§r at §e-?\d+ -?\d+ -?\d+/);
	});
	check("/function vultrom/find_sapphire still works", () => {
		player.messages.length = 0;
		player.addTag("vultrom_find_sapphire");
		env.tick(1);
		assert.match(String(player.messages[0]), /Sapphire Ore§r at/);
	});
}

// ---------- 5. Gemstone Cutter menu (@minecraft/server-ui) ----------
{
	const env = makeServer();
	await loadScript(env);
	const { ItemStack } = env.server;
	const flush = async (ticks = 1) => {
		for (let i = 0; i < ticks; i++) {
			env.tick(1);
			await new Promise((r) => setImmediate(r));
		}
	};
	const player = makePlayer(env, [undefined]);
	const cutter = { typeId: "vultrom:gemstone_cutter", isValid: () => true, dimension: env.dimension, location: { x: 0, y: 64, z: 0 } };
	/** Clicks the cutter; `answers` are button-label prefixes (or "busy") for each form shown. */
	const click = async ({ sneak = false, answers = [] } = {}) => {
		env.ui.forms.length = 0;
		const queue = [...answers];
		env.ui.respond = (form) => {
			const want = queue.shift();
			if (want === undefined) return { canceled: true, cancelationReason: "UserClosed" };
			if (want === "busy") return { canceled: true, cancelationReason: "UserBusy" };
			const selection = form.buttons.findIndex((b) => b.label.startsWith(want));
			assert.ok(selection >= 0, `no button "${want}" in [${form.buttons.map((b) => b.label.split("\n")[0])}]`);
			return { canceled: false, selection };
		};
		player.isSneaking = sneak;
		const ev = { block: cutter, player, itemStack: player.slots[0], isFirstEvent: true };
		env.fire("pib", ev);
		await flush(30);
		return ev;
	};
	const labels = (form) => form.buttons.map((b) => b.label.split("\n")[0]);

	await (async () => {
		const ev = await click();
		check("menu: empty hand opens \"Gemstone Cutter\" with only Close when you carry no raw gems", () => {
			assert.equal(ev.cancel, true);
			assert.equal(env.ui.forms.length, 1);
			assert.equal(env.ui.forms[0].titleText, "Gemstone Cutter");
			assert.deepEqual(labels(env.ui.forms[0]), ["Close"]);
			assert.match(env.ui.forms[0].bodyText, /no raw gems/);
			assert.match(env.ui.forms[0].bodyText, /Bring a villager within 5 blocks/);
		});
	})();

	player.slots[0] = new ItemStack("minecraft:stick", 1);
	player.slots[3] = new ItemStack("vultrom:raw_sapphire", 3);
	player.slots[5] = new ItemStack("vultrom:raw_ruby", 64);
	player.slots[6] = new ItemStack("vultrom:raw_ruby", 6);
	{
		const ev = await click({ answers: ["Cut all Raw Ruby", "Cut 1 Raw Sapphire"] });
		check("menu: holding any other item lists only the raw gems you carry, with Cut 1 / Cut all", () => {
			assert.equal(ev.cancel, true);
			assert.deepEqual(labels(env.ui.forms[0]), ["Cut 1 Raw Sapphire", "Cut all Raw Sapphire", "Cut 1 Raw Ruby", "Cut all Raw Ruby", "Close"]);
			assert.equal(env.ui.forms[0].buttons[0].icon, "textures/items/raw_sapphire");
			assert.match(env.ui.forms[0].buttons[2].label, /You have 70/);
		});
		check("menu: Cut all Raw Ruby cuts all 70 (in full stacks) and reopens with what's left", () => {
			assert.equal(count(player, "vultrom:raw_ruby"), 0);
			assert.equal(count(player, "vultrom:ruby"), 70);
			assert.ok(player.slots.some((s) => s?.typeId === "vultrom:ruby" && s.amount === 64));
			assert.deepEqual(labels(env.ui.forms[1]), ["Cut 1 Raw Sapphire", "Cut all Raw Sapphire", "Close"]);
		});
		check("menu: Cut 1 Raw Sapphire cuts exactly one and reopens", () => {
			assert.equal(count(player, "vultrom:raw_sapphire"), 2);
			assert.equal(count(player, "vultrom:sapphire"), 1);
			assert.equal(env.ui.forms.length, 3);
		});
	}
	{
		await click({ answers: ["busy", "busy", "Cut all Raw Sapphire"] });
		check("menu: retries while the player is busy, then works; closes when no raw gems are left", () => {
			assert.equal(count(player, "vultrom:raw_sapphire"), 0);
			assert.equal(count(player, "vultrom:sapphire"), 3);
			assert.equal(env.ui.forms.length, 3);
		});
	}
	{
		player.slots[0] = new ItemStack("minecraft:cobblestone", 10);
		const ev = await click({ sneak: true });
		check("sneak-click with a block still places it (no menu, event not cancelled)", () => {
			assert.notEqual(ev.cancel, true);
			assert.equal(env.ui.forms.length, 0);
		});
		player.slots[0] = undefined;
		await click({ sneak: true });
		check("sneak-click with an empty hand opens the menu", () => assert.equal(env.ui.forms.length, 1));
	}
	{
		player.slots[0] = new ItemStack("vultrom:raw_sapphire", 5);
		const ev = await click();
		check("shortcut: holding Raw Sapphire, a click cuts 1 without opening the menu", () => {
			assert.equal(ev.cancel, true);
			assert.equal(env.ui.forms.length, 0);
			assert.equal(count(player, "vultrom:raw_sapphire"), 4);
		});
		await click({ sneak: true });
		check("shortcut: sneak-click cuts the held stack", () => assert.equal(count(player, "vultrom:raw_sapphire"), 0));
	}
	{
		const villager = makeEntity("minecraft:villager_v2", { x: 3, y: 64, z: 0 });
		env.entities.push(villager);
		player.slots[0] = undefined;
		await click({ answers: ["Train a Jeweler"] });
		check("menu: Train a Jeweler appears with a villager in range and converts it", () => {
			assert.ok(labels(env.ui.forms[0]).includes("Train a Jeweler"));
			assert.equal(villager.isValid(), false);
			const jewelers = env.entities.filter((e) => e.typeId === "vultrom:jeweler" && e.isValid());
			assert.equal(jewelers.length, 1);
			assert.equal(jewelers[0].nameTag, "Jeweler");
		});
		env.entities.push(makeEntity("minecraft:villager_v2", { x: -2, y: 64, z: 1 }));
		await click();
		check("menu: an employed cutter offers no second Jeweler", () => {
			assert.deepEqual(labels(env.ui.forms[0]), ["Close"]);
			assert.match(env.ui.forms[0].bodyText, /employs a Jeweler/);
		});
	}
}

// ---------- 6. Camera → Photo → viewer → framed picture ----------
const core = await import(pathToFileURL(join(ROOT, "Vultrom_BP/scripts/photo_core.js")).href);
const { PALETTE } = await import(pathToFileURL(join(ROOT, "Vultrom_BP/scripts/photo_palette.js")).href);
const { GLYPH, FRAME, FRAME_COLORS } = await import(pathToFileURL(join(ROOT, "tools/photo-layout.mjs")).href);
const { Image } = await import(pathToFileURL(join(ROOT, "tools/png.mjs")).href);
const chan = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
let photoPixels;
let photoMeta;
{
	const env = makeServer();
	await loadScript(env);
	const { ItemStack } = env.server;
	const flush = async (ticks = 1) => {
		for (let i = 0; i < ticks; i++) {
			env.tick(1);
			await new Promise((r) => setImmediate(r));
		}
	};
	// A late-afternoon scene facing west-north-west (yaw 110): meadow with a few flowers, an oak,
	// a pond, a cobblestone-and-plank house, a cow and a sheep, snowy hills, the low sun.
	const player = makePlayer(env, [new ItemStack("vultrom:camera", 1)]);
	player.location = { x: 0.5, y: 64, z: 0.5 };
	player.rot = { x: 4, y: 110 };
	env.server.world.time = 11200;
	const yaw = (110 * Math.PI) / 180;
	const fwd = [-Math.sin(yaw), Math.cos(yaw)];
	const right = [-Math.cos(yaw), -Math.sin(yaw)];
	const fr = (x, z) => {
		const dx = x + 0.5 - 0.5;
		const dz = z + 0.5 - 0.5;
		return [dx * fwd[0] + dz * fwd[1], dx * right[0] + dz * right[1]];
	};
	const hash = (x, z) => {
		let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	const ground = (F, R) => (F > 40 ? 63 + Math.floor(Math.min(22, (F - 40) / 3 + 4 + 4 * Math.sin(R / 6) + 2 * Math.cos(R / 3.5))) : 63);
	env.scene.at = (x, y, z) => {
		const [F, R] = fr(x, z);
		const h = ground(F, R);
		const pond = ((F - 17) / 6) ** 2 + ((R + 4) / 7) ** 2 < 1;
		if (pond) {
			if (y >= 61 && y <= 63) return "minecraft:water";
			if (y === 60) return "minecraft:sand";
		}
		if (y > h) {
			if (F >= 24 && F <= 30 && R >= -17 && R <= -11) {
				const wall = [24, 30].includes(Math.round(F)) || [-17, -11].includes(Math.round(R));
				if (y === 64 && wall) return "minecraft:cobblestone";
				if (y <= 66 && wall) return y === 65 && Math.abs(R + 14) < 1.2 ? "minecraft:glass" : "minecraft:oak_planks";
				if (y >= 67 && y <= 69 && Math.max(Math.abs(F - 27), Math.abs(R + 14)) <= 3.6 - (y - 67) * 1.2) return "minecraft:spruce_planks";
			}
			const [tF, tR] = [10, 6];
			if (Math.hypot(F - tF, R - tR) < 0.75 && y <= 68) return "minecraft:oak_log";
			if (Math.hypot(F - tF, R - tR, (y - 69) * 1.1) < 2.9 && y >= 67) return "minecraft:oak_leaves";
			if (y === h + 1 && F < 40 && !pond) {
				const r = hash(x, z);
				if (r < 0.006) return "minecraft:poppy";
				if (r < 0.012) return "minecraft:dandelion";
				if (r < 0.2) return "minecraft:short_grass";
			}
			return undefined;
		}
		if (y === h) return h > 76 ? "minecraft:snow" : "minecraft:grass_block";
		if (y >= h - 3) return h > 66 ? "minecraft:stone" : "minecraft:dirt";
		return "minecraft:stone";
	};
	const place = (typeId, F, R) => {
		const e = makeEntity(typeId, { x: 0.5 + F * fwd[0] + R * right[0], y: 64, z: 0.5 + F * fwd[1] + R * right[1] });
		env.entities.push(e);
	};
	place("minecraft:cow", 8, -4);
	place("minecraft:sheep", 15, 4);
	place("minecraft:item", 3, 0);

	env.fire("use", { source: player, itemStack: player.slots[0] });
	const raysAtShutter = env.scene.rays;
	await flush(1);
	check("camera: shutter sound, white flash and a 2 s item cooldown on use", () => {
		assert.ok(env.sounds.includes("camera.take_picture"));
		assert.deepEqual(player.fades[0].fadeColor, { red: 1, green: 1, blue: 1 });
		assert.ok(player.fades[0].fadeTime.fadeInTime + player.fades[0].fadeTime.holdTime + player.fades[0].fadeTime.fadeOutTime < 0.6);
		assert.deepEqual(player.cooldowns, [["vultrom_camera", 40]]);
		assert.equal(raysAtShutter, 0, "no rays on the shutter tick");
	});
	let ticks = 1;
	while (!player.slots.some((s) => s?.typeId === "vultrom:photo") && ticks < 200) {
		await flush(1);
		ticks++;
	}
	const photo = player.slots.find((s) => s?.typeId === "vultrom:photo");
	check("camera: the 32×32 grid develops over several ticks into a Photo", () => {
		assert.ok(photo, "no photo");
		assert.ok(ticks >= 4, `developed in ${ticks} ticks`);
		assert.ok(player.actionBar.some((m) => /Developing… \d+%/.test(m)));
		assert.match(player.actionBar.at(-1), /Photo #1 developed/);
		assert.equal(env.worldDyn["vultrom:photo_count"], 1);
		console.log(`     ${env.scene.rays} rays over ${ticks} ticks`);
	});
	photoPixels = core.decodePixels(photo?.dyn["vultrom:pixels"]);
	photoMeta = JSON.parse(photo?.dyn["vultrom:photo"] ?? "{}");
	check("photo: pixels stored on the item (1024 palette indices) with who/where/when lore", () => {
		assert.equal(photo.dyn["vultrom:pixels"].length, 1024);
		assert.ok(photoPixels);
		assert.deepEqual(photo.lore, ["§7Taken by §fMason", "§7At §f0 64 0 §7(Overworld)", "§7Day 5, 17:12", "§8Photo #1"]);
		assert.deepEqual(photoMeta, { id: 1, by: "Mason", x: 0, y: 64, z: 0, dim: "minecraft:overworld", day: 5, time: 11200 });
	});
	const px = (x, y) => chan(PALETTE[photoPixels[y * 32 + x]]);
	const region = (x0, y0, x1, y1, pred) => {
		let n = 0;
		for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += pred(px(x, y)) ? 1 : 0;
		return n / ((x1 - x0) * (y1 - y0));
	};
	check("photo: sky on top, meadow green at the bottom, the pond blue, the low sun bright", () => {
		assert.ok(region(0, 0, 32, 4, ([r, g, b]) => b > r && b > 120) > 0.6, "top rows should be sky");
		assert.ok(region(0, 28, 32, 32, ([r, g, b]) => g > r && g > b) > 0.5, "bottom rows should be grass");
		let blue = 0;
		let sun = 0;
		for (let i = 0; i < 1024; i++) {
			const [r, g, b] = chan(PALETTE[photoPixels[i]]);
			if (b > r + 40 && b > g && i >= 16 * 32) blue++;
			if (r > 230 && g > 220) sun++;
		}
		assert.ok(blue > 15, `pond pixels: ${blue}`);
		assert.ok(sun >= 1, "sun disc");
	});
	/** Image pixel where world point (F forward, R right, y) lands, using the camera's projection. */
	const project = (F, R, y) => {
		const eye = player.getHeadLocation();
		const f = player.getViewDirection();
		const r = { x: -Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
		const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
		const p = { x: 0.5 + F * fwd[0] + R * right[0] - eye.x, y: y - eye.y, z: 0.5 + F * fwd[1] + R * right[1] - eye.z };
		const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
		const t = Math.tan((35 * Math.PI) / 180) * dot(p, f);
		return [Math.floor(((dot(p, r) / t + 1) / 2) * 32), Math.floor(((1 - dot(p, u) / Math.hypot(u.x, u.y, u.z) / t) / 2) * 32)];
	};
	check("photo: mobs show up (brown cow, white sheep); dropped items don't", () => {
		const [cr, cg, cb] = px(...project(8, -4, 64.7));
		assert.ok(cr > cb && cr < 140 && cg < 120, `cow pixel ${[cr, cg, cb]}`);
		const [sr, sg, sb] = px(...project(15, 4, 64.7));
		assert.ok(Math.min(sr, sg, sb) > 140, `sheep pixel ${[sr, sg, sb]}`);
		const [ir, ig, ib] = px(...project(3, 0, 64.3));
		assert.ok(ig > ir && ig > ib, `item spot should show the meadow, got ${[ir, ig, ib]}`);
	});

	env.fire("use", { source: player, itemStack: player.slots[0] });
	await flush(2);
	check("camera: cooldown — a second click within 2 s does nothing", () => {
		assert.equal(env.sounds.filter((s) => s === "camera.take_picture").length, 1);
		assert.equal(player.fades.length, 1);
	});
	await flush(40);
	env.fire("use", { source: player, itemStack: player.slots[0] });
	await flush(1);
	check("camera: works again after the cooldown", () => assert.equal(player.fades.length, 2));
	await flush(40);

	{
		const slow = makeServer();
		await loadScript(slow);
		const p2 = makePlayer(slow, [new slow.server.ItemStack("vultrom:camera", 1)]);
		slow.scene.at = env.scene.at;
		slow.scene.slowRayMs = 0.4;
		p2.rot = { x: 4, y: 110 };
		slow.fire("use", { source: p2, itemStack: p2.slots[0] });
		slow.tick(1);
		let worst = 0;
		let n = 0;
		while (!p2.slots.some((s) => s?.typeId === "vultrom:photo") && n < 400) {
			const t0 = performance.now();
			slow.tick(1);
			worst = Math.max(worst, performance.now() - t0);
			n++;
		}
		check("camera: slow raycasts stay within the per-tick budget (lag-free) and still finish", () => {
			assert.ok(p2.slots.some((s) => s?.typeId === "vultrom:photo"), "never finished");
			assert.ok(worst < 9, `worst tick ${worst.toFixed(1)} ms`);
			console.log(`     0.4 ms/ray: ${n} ticks, worst tick ${worst.toFixed(1)} ms`);
		});
	}

	// viewer
	player.selectedSlotIndex = player.slots.indexOf(photo);
	env.ui.forms.length = 0;
	env.ui.respond = () => ({ canceled: true, cancelationReason: "UserClosed" });
	env.fire("use", { source: player, itemStack: photo });
	await flush(2);
	const viewer = env.ui.forms[0];
	check("viewer: using a Photo opens it as 16 lines of 32 half-block glyphs plus its info", () => {
		assert.equal(viewer.titleText, "Photo #1");
		const lines = viewer.bodyText.split("\n");
		const pic = lines.slice(0, 16);
		const decoded = new Uint8Array(1024);
		pic.forEach((line, row) => {
			assert.ok(line.startsWith("§f"));
			const glyphs = [...line.slice(2)];
			assert.equal(glyphs.length, 32);
			glyphs.forEach((ch, x) => {
				const g = ch.codePointAt(0) - 0xe200;
				assert.ok(g >= 0 && g < 4096);
				decoded[row * 2 * 32 + x] = g >> 6;
				decoded[(row * 2 + 1) * 32 + x] = g & 63;
			});
		});
		assert.deepEqual(decoded, photoPixels);
		assert.deepEqual(lines.slice(17), ["§7Taken by §fMason", "§7At §f0 64 0 §7(Overworld)", "§7Day 5, 17:12"]);
	});
	check("viewer: fits the 225-px form width (5 px per glyph)", () => assert.ok(32 * GLYPH.advance <= 200));

	// hanging
	const wall = { typeId: "minecraft:stone", location: { x: 10, y: 64, z: 10 }, dimension: env.dimension, isValid: () => true };
	env.blocks.set("10,64,9", "minecraft:air");
	const useOn = async (face, { sneak = false } = {}) => {
		env.ui.forms.length = 0;
		player.isSneaking = sneak;
		const ev = { block: wall, player, itemStack: player.slots[player.selectedSlotIndex], blockFace: face, isFirstEvent: true };
		env.fire("pib", ev);
		await flush(2);
		player.isSneaking = false;
		return ev;
	};
	await useOn("Up");
	check("hang: using a Photo on the top of a block views it instead", () => {
		assert.equal(env.ui.forms.length, 1);
		assert.equal(env.entities.filter((e) => e.typeId === "vultrom:photo_tile").length, 0);
	});
	await useOn("North", { sneak: true });
	check("hang: sneak-using it on a wall views it instead", () => assert.equal(env.ui.forms.length, 1));
	const hung = await useOn("North");
	const tiles = env.entities.filter((e) => e.typeId === "vultrom:photo_tile" && e.isValid());
	check("hang: using it on a wall side spawns the 16-tile framed picture facing out of the wall", () => {
		assert.equal(hung.cancel, true);
		assert.equal(tiles.length, 16);
		for (const t of tiles) {
			assert.deepEqual(t.location, { x: 10.5, y: 64, z: 9.5 });
			assert.deepEqual(t.rot, { x: 0, y: 180 });
		}
		assert.deepEqual(tiles.map((t) => t.props["vultrom:tile"]).sort((a, b) => a - b), [...Array(16).keys()]);
		assert.ok(env.sounds.includes("block.itemframe.place"));
	});
	check("hang: tile properties decode back to the photo; survival uses up the Photo", () => {
		const byTile = [];
		for (const t of tiles) byTile[t.props["vultrom:tile"]] = Array.from({ length: 16 }, (_, k) => t.props[`vultrom:p${k}`]);
		assert.deepEqual(core.pixelsFromTiles(byTile), photoPixels);
		for (const v of byTile.flat()) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 24);
		assert.equal(player.slots.filter((s) => s?.typeId === "vultrom:photo").length, 1);
	});
	player.selectedSlotIndex = player.slots.findIndex((s) => s?.typeId === "vultrom:photo");
	const before2 = env.entities.length;
	await useOn("North");
	check("hang: a second photo can't go on the same spot", () => {
		assert.equal(env.entities.length, before2);
		assert.match(player.actionBar.at(-1), /already a photo/);
	});
	env.blocks.set("11,64,10", "minecraft:air");
	await useOn("East");
	check("hang: east side faces east (yaw -90)", () => {
		const east = env.entities.filter((e) => e.typeId === "vultrom:photo_tile" && e.isValid() && e.location.x === 11.5);
		assert.equal(east.length, 16);
		assert.equal(east[0].rot.y, -90);
	});
	env.ui.forms.length = 0;
	env.fire("pie", { target: tiles[5], player });
	await flush(2);
	check("frame: right-clicking a framed photo opens the viewer", () => {
		assert.equal(env.ui.forms.length, 1);
		assert.equal(env.ui.forms[0].titleText, "Photo #1");
	});
	env.spawnedItems.length = 0;
	env.fire("hit", { damagingEntity: player, hitEntity: tiles[9] });
	check("frame: hitting it takes the whole picture down and drops the Photo (same picture and lore)", () => {
		assert.equal(tiles.filter((t) => t.isValid()).length, 0);
		assert.equal(env.entities.filter((e) => e.typeId === "vultrom:photo_tile" && e.isValid()).length, 16, "the east frame stays");
		assert.equal(env.spawnedItems.length, 1);
		const drop = env.spawnedItems[0].stack;
		assert.equal(drop.typeId, "vultrom:photo");
		assert.equal(drop.dyn["vultrom:pixels"], photo.dyn["vultrom:pixels"]);
		assert.deepEqual(drop.lore, photo.lore);
	});
	player.gameMode = "creative";
	env.spawnedItems.length = 0;
	const eastTile = env.entities.find((e) => e.typeId === "vultrom:photo_tile" && e.isValid());
	env.fire("hit", { damagingEntity: player, hitEntity: eastTile });
	check("frame: in creative, taking it down drops nothing", () => {
		assert.equal(env.entities.filter((e) => e.typeId === "vultrom:photo_tile" && e.isValid()).length, 0);
		assert.equal(env.spawnedItems.length, 0);
	});
	player.gameMode = "survival";

	const blank = new ItemStack("vultrom:photo", 1);
	await flush(5);
	env.fire("use", { source: player, itemStack: blank });
	await flush(1);
	check("photo: a blank /give Photo says so instead of failing", () => assert.match(player.actionBar.at(-1), /blank/));

	player.slots[0] = new ItemStack("vultrom:camera", 1);
	player.selectedSlotIndex = 0;
	await flush(45);
	env.ui.forms.length = 0;
	const fadesBefore = player.fades.length;
	const cutter = { typeId: "vultrom:gemstone_cutter", isValid: () => true, dimension: env.dimension, location: { x: 0, y: 64, z: 0 } };
	env.fire("pib", { block: cutter, player, itemStack: player.slots[0], blockFace: "North", isFirstEvent: true });
	await flush(3);
	check("camera: clicking the Gemstone Cutter with it still opens the cutter menu, no photo", () => {
		assert.equal(player.fades.length, fadesBefore);
		assert.equal(env.ui.forms[0]?.titleText, "Gemstone Cutter");
	});
	env.fire("pib", { block: wall, player, itemStack: player.slots[0], blockFace: "North", isFirstEvent: true });
	await flush(1);
	check("camera: clicking any other block takes a photo", () => assert.equal(player.fades.length, fadesBefore + 1));
	await flush(60);

	check("photo lore stays within 50 characters for long names and far coordinates", () => {
		for (const line of core.photoLore({ id: 123456, by: "AVeryLongPlayerNameIndeed_x", x: -29999984, y: -64, z: 29999984, dim: "minecraft:the_end", day: 123456, time: 23999 })) {
			assert.ok(line.length <= 50, line);
		}
	});
}

// ---------- 7. generated assets agree with the script ----------
{
	const geo = JSON.parse(read("Vultrom_RP/models/entity/photo_tile.geo.json"))["minecraft:geometry"][0];
	const anim = JSON.parse(read("Vultrom_RP/animations/photo_tile.animation.json")).animations["animation.vultrom.photo_tile.pixels"];
	const bones = new Map(geo.bones.map((b) => [b.name, b]));
	const STEP = 360 / 64;
	const rotX = (p, pivot, deg) => {
		const a = (deg * Math.PI) / 180;
		const y = p[1] - pivot[1];
		const z = p[2] - pivot[2];
		return [p[0], pivot[1] + y * Math.cos(a) - z * Math.sin(a), pivot[2] + y * Math.sin(a) + z * Math.cos(a)];
	};
	/** Front-facing color of a pixel drum at bone rotation `deg`, and the nearest z of any other face. */
	const drumFront = (bone, deg) => {
		let front;
		let othersMinZ = Infinity;
		for (const cube of bone.cubes) {
			for (const [face, zLocal] of [["north", cube.origin[2]], ["south", cube.origin[2] + cube.size[2]]]) {
				const corners = [
					[cube.origin[0], cube.origin[1], zLocal],
					[cube.origin[0], cube.origin[1] + cube.size[1], zLocal]
				].map((p) => rotX(rotX(p, cube.pivot, cube.rotation?.[0] ?? 0), bone.pivot, deg));
				const [u, v] = cube.uv[face].uv;
				const color = ((v - 2) / 8) * 8 + (u - 2) / 8;
				const flat = Math.abs(corners[0][2] - corners[1][2]) < 1e-6;
				if (flat && Math.abs(corners[0][2] - FRAME.plane) < 1e-6) front = color;
				else othersMinZ = Math.min(othersMinZ, ...corners.map((c) => c[2]));
			}
		}
		return { front, othersMinZ };
	};
	check("frame geometry: 64 pixel drums per tile, borders, sized to the block face", () => {
		assert.equal(geo.bones.filter((b) => b.name.startsWith("px_")).length, 64);
		for (const b of ["root", "strip", "border_top", "border_bottom", "border_sides"]) assert.ok(bones.has(b), b);
		assert.ok(geo.bones.length <= 72);
		assert.equal(geo.description.texture_width, 128);
	});
	check("frame geometry: turning a drum by −c·5.625° shows palette color c, every other face behind the picture", () => {
		const bone = bones.get("px_1_17");
		for (let c = 0; c < 64; c++) {
			const { front, othersMinZ } = drumFront(bone, -c * STEP);
			assert.equal(front, c);
			assert.ok(othersMinZ > FRAME.plane - 1e-6, `color ${c}: a face pokes out at z=${othersMinZ}`);
		}
	});
	check("frame animation: Molang unpacks the tile properties exactly like the script packs them", () => {
		const props = core.tileProperties(photoPixels, 3);
		const q = { property: (n) => props[Number(n.split(":p")[1])] };
		const math = { mod: (a, b) => a % b, floor: Math.floor };
		for (let i = 0; i < 64; i++) {
			const expr = anim.bones[`px_${Math.floor(i / 32)}_${i % 32}`].rotation[0];
			const deg = new Function("q", "math", `return ${expr};`)(q, math);
			assert.equal(Math.round(-deg / STEP), photoPixels[3 * 64 + i]);
		}
		assert.match(anim.bones.strip.position[1], /vultrom:tile'\) \* 0\.875/);
	});
	check("palette: 64 distinct colors, matching the photo_tile property ranges", () => {
		assert.equal(new Set(PALETTE).size, 64);
		const tile = JSON.parse(read("Vultrom_BP/entities/photo_tile.json"))["minecraft:entity"].description.properties;
		assert.deepEqual(tile["vultrom:p15"].range, [0, 2 ** 24 - 1]);
		assert.deepEqual(tile["vultrom:tile"].range, [0, 15]);
	});
}

// ---------- preview: the mock photo as the viewer form and as a framed picture ----------
if (process.env.PHOTO_PREVIEW && photoPixels) {
	const S = 3;
	const img = new Image(1040, 600);
	img.fill(0, 0, 1040, 600, 0x1e1e1f);
	// Left: viewer form at GUI scale 3 (one glyph = 4 colored + 1 gap px; 10-px lines).
	img.fill(24, 24, 500, 552, 0x313233);
	img.fill(24, 24, 500, 40, 0x48494a);
	const ox = 24 + (500 - 32 * GLYPH.advance * S) / 2;
	const oy = 84;
	for (let row = 0; row < 16; row++) {
		for (let x = 0; x < 32; x++) {
			const top = PALETTE[photoPixels[row * 64 + x]];
			const bottom = PALETTE[photoPixels[row * 64 + 32 + x]];
			const half = (GLYPH.lineHeight / 2) * S;
			img.fill(ox + x * GLYPH.advance * S, oy + row * GLYPH.lineHeight * S, GLYPH.inkWidth * S, half, top);
			img.fill(ox + x * GLYPH.advance * S, oy + row * GLYPH.lineHeight * S + half, GLYPH.inkWidth * S, half, bottom);
		}
	}
	// Right: the framed picture on a wall (one model unit = 30 px).
	const U = 30;
	const fx = 548;
	const fy = 60;
	img.fill(fx - 12, fy - 12, 16 * U + 24, 16 * U + 24, 0x7d7d7d);
	img.fill(fx, fy, 16 * U, 16 * U, FRAME_COLORS.front);
	const p = FRAME.pixel * U;
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < 32; x++) img.fill(Math.round(fx + U + x * p), Math.round(fy + U + y * p), Math.ceil(p), Math.ceil(p), PALETTE[photoPixels[y * 32 + x]]);
	}
	writeFileSync(process.env.PHOTO_PREVIEW, img.encode());
	console.log(`preview written to ${process.env.PHOTO_PREVIEW}`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
