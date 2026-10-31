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
			if (typeof v === "string" && v.length > 32767) throw new Error(`dynamic property ${k} is ${v.length} characters`);
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
	return dir;
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
		events: [],
		triggerEvent(ev) {
			this.events.push(ev);
		},
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
			if (typeof v === "string" && v.length > 32767) throw new Error(`dynamic property ${k} is ${v.length} characters`);
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
const { GLYPH, FRAME, FRAME_COLORS, FRAME_DETAIL_DISTANCE, framePixel } = await import(pathToFileURL(join(ROOT, "tools/photo-layout.mjs")).href);
const { Image } = await import(pathToFileURL(join(ROOT, "tools/png.mjs")).href);
const chan = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Palette indices drawn by viewer glyph lines (`§f` + half-block glyphs). */
function decodeLines(lines) {
	const w = [...lines[0].slice(2)].length;
	const out = new Uint8Array(w * lines.length * 2);
	lines.forEach((line, row) => {
		assert.ok(line.startsWith("§f"));
		const glyphs = [...line.slice(2)];
		assert.equal(glyphs.length, w);
		glyphs.forEach((ch, x) => {
			const g = ch.codePointAt(0) - 0xe200;
			assert.ok(g >= 0 && g < 4096);
			out[row * 2 * w + x] = g >> 6;
			out[(row * 2 + 1) * w + x] = g & 63;
		});
	});
	return out;
}
const tilesOf = (env, type) => env.entities.filter((e) => e.typeId === type && e.isValid());
let photo64;
let photo32;
{
	const env = makeServer();
	const dir = await loadScript(env);
	const camera = await import(pathToFileURL(join(dir, "camera.js")).href);
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
	const photos = () => player.slots.filter((s) => s?.typeId === "vultrom:photo");
	const waitForPhoto = async (count, limit = 400) => {
		let ticks = 0;
		while (photos().length < count && ticks < limit) {
			await flush(1);
			ticks++;
		}
		return ticks;
	};

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
	const ticks = 1 + (await waitForPhoto(1));
	const photo = photos()[0];
	check("camera: the 64×64 grid develops over several ticks into a Photo, with a progress bar", () => {
		assert.ok(photo, "no photo");
		assert.ok(ticks >= 16, `developed in ${ticks} ticks`);
		const progress = player.actionBar.filter((m) => m.startsWith("§7Developing…"));
		assert.ok(progress.length >= 8, `${progress.length} progress updates`);
		assert.match(progress[0], /^§7Developing… §f\|*§8\|* §7\d+%$/);
		for (const m of progress) assert.equal((m.match(/\|/g) ?? []).length, 20);
		assert.match(player.actionBar.at(-1), /Photo #1 developed/);
		assert.equal(env.worldDyn["vultrom:photo_count"], 1);
		console.log(`     ${env.scene.rays} rays over ${ticks} ticks`);
	});
	photo64 = core.decodePixels(photo?.dyn["vultrom:pixels"]);
	const photoMeta = JSON.parse(photo?.dyn["vultrom:photo"] ?? "{}");
	check("photo: 4096 palette indices on the item with who/where/when/size lore", () => {
		assert.equal(photo.dyn["vultrom:pixels"].length, 4096);
		assert.ok(photo64);
		assert.deepEqual(photo.lore, ["§7Taken by §fMason", "§7At §f0 64 0 §7(Overworld)", "§7Day 5, 17:12", "§8Photo #1 · 64x64"]);
		assert.deepEqual(photoMeta, { id: 1, size: 64, by: "Mason", x: 0, y: 64, z: 0, dim: "minecraft:overworld", day: 5, time: 11200 });
	});
	check("storage: a 64×64 photo uses 4096 of the 32,767 characters a dynamic property allows", () => {
		assert.ok(photo.dyn["vultrom:pixels"].length + photo.dyn["vultrom:photo"].length < core.MAX_PROPERTY_LENGTH / 7);
	});
	const px = (x, y) => chan(PALETTE[photo64[y * 64 + x]]);
	const region = (x0, y0, x1, y1, pred) => {
		let n = 0;
		for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += pred(px(x, y)) ? 1 : 0;
		return n / ((x1 - x0) * (y1 - y0));
	};
	check("photo: sky on top, meadow green at the bottom, the pond blue, the low sun bright", () => {
		assert.ok(region(0, 0, 64, 8, ([r, g, b]) => b > r && b > 120) > 0.6, "top rows should be sky");
		assert.ok(region(0, 56, 64, 64, ([r, g, b]) => g > r && g > b) > 0.5, "bottom rows should be grass");
		let blue = 0;
		let sun = 0;
		for (let i = 0; i < 4096; i++) {
			const [r, g, b] = chan(PALETTE[photo64[i]]);
			if (b > r + 40 && b > g && i >= 32 * 64) blue++;
			if (r > 230 && g > 220) sun++;
		}
		assert.ok(blue > 60, `pond pixels: ${blue}`);
		assert.ok(sun >= 4, `sun disc: ${sun} pixels`);
	});
	/** Image pixel where world point (F forward, R right, y) lands, using the camera's projection. */
	const project = (F, R, y, size = 64) => {
		const eye = player.getHeadLocation();
		const f = player.getViewDirection();
		const r = { x: -Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
		const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
		const p = { x: 0.5 + F * fwd[0] + R * right[0] - eye.x, y: y - eye.y, z: 0.5 + F * fwd[1] + R * right[1] - eye.z };
		const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
		const t = Math.tan((35 * Math.PI) / 180) * dot(p, f);
		return [Math.floor(((dot(p, r) / t + 1) / 2) * size), Math.floor(((1 - dot(p, u) / Math.hypot(u.x, u.y, u.z) / t) / 2) * size)];
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
	await waitForPhoto(2);
	await flush(40);

	{
		// Every ray takes 0.25 ms (far slower than Bedrock); two players develop at once.
		const slow = makeServer();
		await loadScript(slow);
		const p2 = makePlayer(slow, [new slow.server.ItemStack("vultrom:camera", 1)]);
		const p3 = makePlayer(slow, [new slow.server.ItemStack("vultrom:camera", 1)]);
		p3.id = "p3";
		slow.scene.at = env.scene.at;
		slow.scene.slowRayMs = 0.25;
		p2.rot = { x: 4, y: 110 };
		p3.rot = { x: 10, y: 60 };
		slow.fire("use", { source: p2, itemStack: p2.slots[0] });
		slow.fire("use", { source: p3, itemStack: p3.slots[0] });
		slow.tick(1);
		const done = (p) => p.slots.some((s) => s?.typeId === "vultrom:photo");
		let worst = 0;
		let n = 0;
		const finished = {};
		while (!(done(p2) && done(p3)) && n < 3000) {
			const t0 = performance.now();
			slow.tick(1);
			worst = Math.max(worst, performance.now() - t0);
			n++;
			for (const p of [p2, p3]) if (done(p) && !finished[p.id]) finished[p.id] = n;
		}
		check("camera: slow raycasts stay within the shared per-tick budget (lag-free) and both photos finish", () => {
			assert.ok(done(p2) && done(p3), "never finished");
			assert.ok(worst < 9, `worst tick ${worst.toFixed(1)} ms`);
			assert.ok(Math.abs(finished.p1 - finished.p3) < 0.25 * n, `uneven: ${finished.p1} vs ${finished.p3} ticks`);
			console.log(`     0.25 ms/ray, two players: ${n} ticks, worst tick ${worst.toFixed(1)} ms`);
		});
	}

	// viewer: overview + quarters
	player.selectedSlotIndex = player.slots.indexOf(photo);
	env.ui.forms.length = 0;
	const answers = [0, 0, 3, 1];
	env.ui.respond = () => (answers.length ? { canceled: false, selection: answers.shift() } : { canceled: true, cancelationReason: "UserClosed" });
	env.fire("use", { source: player, itemStack: photo });
	await flush(3);
	const [overview, topLeft, overview2, bottomRight] = env.ui.forms;
	check("viewer: a 64×64 Photo opens as a 32×32 overview (16 glyph lines) plus its info and quarter buttons", () => {
		assert.equal(overview.titleText, "Photo #1");
		const lines = overview.bodyText.split("\n");
		assert.deepEqual(decodeLines(lines.slice(0, 16)), core.downsample(photo64, 64));
		assert.deepEqual(lines.slice(17, 20), ["§7Taken by §fMason", "§7At §f0 64 0 §7(Overworld)", "§7Day 5, 17:12"]);
		assert.deepEqual(
			overview.buttons.map((b) => b.label),
			["Top left", "Top right", "Bottom left", "Bottom right", "Close"]
		);
	});
	check("viewer: each quarter shows its 32×32 pixels at full detail; Back returns to the overview", () => {
		assert.equal(env.ui.forms.length, 4);
		assert.equal(topLeft.titleText, "Photo #1 · Top left");
		assert.deepEqual(decodeLines(topLeft.bodyText.split("\n")), core.crop(photo64, 64, 0, 0, 32));
		assert.deepEqual(topLeft.buttons.map((b) => b.label), ["Back", "Close"]);
		assert.equal(overview2.bodyText, overview.bodyText);
		assert.equal(bottomRight.titleText, "Photo #1 · Bottom right");
		assert.deepEqual(decodeLines(bottomRight.bodyText.split("\n")), core.crop(photo64, 64, 32, 32, 32));
	});
	check("viewer: every page is 32 glyphs wide (160 px fits the ~225-px form; 64 glyphs would need 320)", () => {
		for (const form of env.ui.forms) for (const line of form.bodyText.split("\n").filter((l) => l.startsWith("§f"))) assert.equal([...line.slice(2)].length, 32);
		assert.ok(32 * GLYPH.advance <= 200 && 64 * GLYPH.advance > 225);
	});
	env.ui.respond = () => ({ canceled: true, cancelationReason: "UserClosed" });

	// hanging
	const wall = { typeId: "minecraft:stone", location: { x: 10, y: 64, z: 10 }, dimension: env.dimension, isValid: () => true };
	env.blocks.set("10,64,9", "minecraft:air");
	const useOn = async (face, { sneak = false, block = wall } = {}) => {
		env.ui.forms.length = 0;
		player.isSneaking = sneak;
		const ev = { block, player, itemStack: player.slots[player.selectedSlotIndex], blockFace: face, isFirstEvent: true };
		env.fire("pib", ev);
		await flush(2);
		player.isSneaking = false;
		return ev;
	};
	await flush(5);
	await useOn("Up");
	check("hang: using a Photo on the top of a block views it instead", () => {
		assert.equal(env.ui.forms.length, 1);
		assert.equal(tilesOf(env, "vultrom:photo_tile64").length, 0);
	});
	await useOn("North", { sneak: true });
	check("hang: sneak-using it on a wall views it instead", () => assert.equal(env.ui.forms.length, 1));
	const hung = await useOn("North");
	const tiles = tilesOf(env, "vultrom:photo_tile64");
	check("hang: a 64×64 photo hangs as 32 tile entities (128 pixels each) facing out of the wall", () => {
		assert.equal(hung.cancel, true);
		assert.equal(tiles.length, 32);
		for (const t of tiles) {
			assert.deepEqual(t.location, { x: 10.5, y: 64, z: 9.5 });
			assert.deepEqual(t.rot, { x: 0, y: 180 });
			assert.equal(t.events.length, 1);
		}
		assert.deepEqual(tiles.map((t) => t.events[0]).sort(), [...Array(32).keys()].map((t) => `vultrom:tile_${t}`).sort());
		assert.ok(env.sounds.includes("block.itemframe.place"));
	});
	check("hang: tile properties decode back to the photo; survival uses up the Photo", () => {
		const byTile = [];
		for (const t of tiles) {
			const props = Object.keys(t.props);
			assert.equal(props.length, 32);
			byTile[Number(t.events[0].split("_").at(-1))] = Array.from({ length: 32 }, (_, k) => t.props[`vultrom:p${k}`]);
		}
		assert.deepEqual(core.pixelsFromTiles(byTile, 64), photo64);
		for (const v of byTile.flat()) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 24);
		assert.equal(photos().length, 1);
	});
	check("storage: the frame keeps the photo once (on one tile), within the dynamic property limit", () => {
		const holders = tiles.filter((t) => t.dyn["vultrom:photo"] !== undefined);
		assert.equal(holders.length, 1);
		assert.ok(holders[0].dyn["vultrom:photo"].length < core.MAX_PROPERTY_LENGTH / 7);
		assert.equal(new Set(tiles.map((t) => t.dyn["vultrom:frame"])).size, 1);
	});
	player.selectedSlotIndex = player.slots.indexOf(photos()[0]);
	const before2 = env.entities.length;
	await useOn("North");
	check("hang: a second photo can't go on the same spot", () => {
		assert.equal(env.entities.length, before2);
		assert.match(player.actionBar.at(-1), /already a photo/);
	});
	env.blocks.set("11,64,10", "minecraft:air");
	await useOn("East");
	check("hang: east side faces east (yaw -90)", () => {
		const east = tilesOf(env, "vultrom:photo_tile64").filter((e) => e.location.x === 11.5);
		assert.equal(east.length, 32);
		assert.equal(east[0].rot.y, -90);
	});
	env.ui.forms.length = 0;
	const plain = tiles.find((t) => t.dyn["vultrom:photo"] === undefined);
	env.fire("pie", { target: plain, player });
	await flush(2);
	check("frame: right-clicking any tile of a framed photo opens the viewer", () => {
		assert.equal(env.ui.forms.length, 1);
		assert.equal(env.ui.forms[0].titleText, "Photo #1");
	});
	env.spawnedItems.length = 0;
	env.fire("hit", { damagingEntity: player, hitEntity: tiles[9] });
	check("frame: hitting it takes the whole picture down and drops the Photo (same picture and lore)", () => {
		assert.equal(tiles.filter((t) => t.isValid()).length, 0);
		assert.equal(tilesOf(env, "vultrom:photo_tile64").length, 32, "the east frame stays");
		assert.equal(env.spawnedItems.length, 1);
		const drop = env.spawnedItems[0].stack;
		assert.equal(drop.typeId, "vultrom:photo");
		assert.equal(drop.dyn["vultrom:pixels"], photo.dyn["vultrom:pixels"]);
		assert.deepEqual(drop.lore, photo.lore);
	});
	player.gameMode = "creative";
	env.spawnedItems.length = 0;
	env.fire("hit", { damagingEntity: player, hitEntity: tilesOf(env, "vultrom:photo_tile64")[0] });
	check("frame: in creative, taking it down drops nothing", () => {
		assert.equal(tilesOf(env, "vultrom:photo_tile64").length, 0);
		assert.equal(env.spawnedItems.length, 0);
	});
	player.gameMode = "survival";

	// v0.1.10 photos: 32×32, no size in their meta
	player.slots[0] = new ItemStack("vultrom:camera", 1);
	player.selectedSlotIndex = 0;
	await flush(45);
	const before32 = photos().length;
	camera.snap(player, 32);
	await waitForPhoto(before32 + 1);
	const fresh32 = photos().at(-1);
	photo32 = core.decodePixels(fresh32.dyn["vultrom:pixels"]);
	const legacyMeta = { id: 7, by: "Mason", x: 0, y: 64, z: 0, dim: "minecraft:overworld", day: 5, time: 11200 };
	const legacy = new ItemStack("vultrom:photo", 1);
	legacy.setLore(core.photoLore(legacyMeta));
	legacy.setDynamicProperty("vultrom:photo", JSON.stringify(legacyMeta));
	legacy.setDynamicProperty("vultrom:pixels", fresh32.dyn["vultrom:pixels"]);
	player.slots[player.slots.indexOf(fresh32)] = legacy;
	player.selectedSlotIndex = player.slots.indexOf(legacy);
	check("legacy: the same scene at 32×32 is still a valid 1024-pixel photo", () => {
		assert.equal(photo32.length, 1024);
		assert.deepEqual(legacy.lore.at(-1), "§8Photo #7");
	});
	await flush(5);
	env.ui.forms.length = 0;
	env.fire("use", { source: player, itemStack: legacy });
	await flush(2);
	check("legacy: a v0.1.10 32×32 Photo still opens on one page (16 lines of 32 glyphs, Close)", () => {
		assert.equal(env.ui.forms.length, 1);
		const lines = env.ui.forms[0].bodyText.split("\n");
		assert.deepEqual(decodeLines(lines.slice(0, 16)), photo32);
		assert.deepEqual(lines.slice(17), ["§7Taken by §fMason", "§7At §f0 64 0 §7(Overworld)", "§7Day 5, 17:12"]);
		assert.deepEqual(env.ui.forms[0].buttons.map((b) => b.label), ["Close"]);
	});
	env.blocks.set("10,64,11", "minecraft:air");
	await useOn("South");
	const old = tilesOf(env, "vultrom:photo_tile");
	check("legacy: it hangs in the 16-tile 32×32 frame (vultrom:tile property, 16 packed properties)", () => {
		assert.equal(old.length, 16);
		assert.equal(old[0].rot.y, 0);
		const byTile = [];
		for (const t of old) byTile[t.props["vultrom:tile"]] = Array.from({ length: 16 }, (_, k) => t.props[`vultrom:p${k}`]);
		assert.deepEqual(core.pixelsFromTiles(byTile, 32), photo32);
		assert.equal(old[0].events.length, 0);
	});
	env.ui.forms.length = 0;
	env.fire("pie", { target: old[11], player });
	await flush(2);
	check("legacy: its frame opens the viewer", () => assert.equal(env.ui.forms[0]?.titleText, "Photo #7"));
	env.spawnedItems.length = 0;
	env.fire("hit", { damagingEntity: player, hitEntity: old[4] });
	check("legacy: taking it down gives back the same 32×32 photo", () => {
		assert.equal(tilesOf(env, "vultrom:photo_tile").length, 0);
		const drop = env.spawnedItems[0]?.stack;
		assert.equal(drop?.dyn["vultrom:pixels"], legacy.dyn["vultrom:pixels"]);
		assert.equal(drop.lore.at(-1), "§8Photo #7 · 32x32");
	});

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
		for (const line of core.photoLore({ id: 123456, size: 64, by: "AVeryLongPlayerNameIndeed_x", x: -29999984, y: -64, z: 29999984, dim: "minecraft:the_end", day: 123456, time: 23999 })) {
			assert.ok(line.length <= 50, line);
		}
	});
}

// ---------- 7. generated assets agree with the script ----------
{
	const STEP = 360 / 64;
	const rotX = (p, pivot, deg) => {
		const a = (deg * Math.PI) / 180;
		const y = p[1] - pivot[1];
		const z = p[2] - pivot[2];
		return [p[0], pivot[1] + y * Math.cos(a) - z * Math.sin(a), pivot[2] + y * Math.sin(a) + z * Math.cos(a)];
	};
	/** Front-facing color of a pixel drum at bone rotation `deg`, its height, and the nearest z of any other face. */
	const drumFront = (bone, deg) => {
		let front;
		let height;
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
				if (flat && Math.abs(corners[0][2] - FRAME.plane) < 1e-6) {
					front = color;
					height = Math.abs(corners[1][1] - corners[0][1]);
				} else othersMinZ = Math.min(othersMinZ, ...corners.map((c) => c[2]));
			}
		}
		return { front, height, othersMinZ };
	};
	const variants = [
		{ size: 32, name: "photo_tile", pixels: () => photo32, strip: /^-q\.property\('vultrom:tile'\) \* 0\.875$/ },
		{ size: 64, name: "photo_tile64", pixels: () => photo64, strip: /^-q\.variant \* 0\.4375$/ }
	];
	for (const { size, name, pixels, strip } of variants) {
		const geo = JSON.parse(read(`Vultrom_RP/models/entity/${name}.geo.json`))["minecraft:geometry"][0];
		const anim = JSON.parse(read(`Vultrom_RP/animations/${name}.animation.json`)).animations[`animation.vultrom.${name}.pixels`];
		const bones = new Map(geo.bones.map((b) => [b.name, b]));
		const { rows, props } = core.FRAMES[size];
		check(`frame ${size}×${size} geometry: ${rows * size} pixel drums per tile, borders, sized to the block face`, () => {
			assert.equal(geo.description.identifier, `geometry.vultrom.${name}`);
			assert.equal(geo.bones.filter((b) => b.name.startsWith("px_")).length, rows * size);
			for (const b of ["root", "strip", "border_top", "border_bottom", "border_sides"]) assert.ok(bones.has(b), b);
			assert.ok(geo.bones.length <= rows * size + 6);
			assert.equal(geo.description.texture_width, 128);
		});
		check(`frame ${size}×${size} geometry: turning a drum by −c·5.625° shows palette color c, every other face behind the picture`, () => {
			const bone = bones.get(`px_1_${size / 2 + 1}`);
			for (let c = 0; c < 64; c++) {
				const { front, height, othersMinZ } = drumFront(bone, -c * STEP);
				assert.equal(front, c);
				assert.ok(Math.abs(height - framePixel(size)) < 1e-3, `pixel height ${height}`);
				assert.ok(othersMinZ > FRAME.plane - 1e-6, `color ${c}: a face pokes out at z=${othersMinZ}`);
			}
		});
		check(`frame ${size}×${size} animation: Molang unpacks the tile properties exactly like the script packs them`, () => {
			const tile = 3;
			const values = core.tileProperties(pixels(), tile, size);
			assert.equal(values.length, props);
			const q = { property: (n) => values[Number(n.split(":p")[1])] };
			const math = { mod: (a, b) => a % b, floor: Math.floor };
			for (let i = 0; i < rows * size; i++) {
				const expr = anim.bones[`px_${Math.floor(i / size)}_${i % size}`].rotation[0];
				const deg = new Function("q", "math", `return ${expr};`)(q, math);
				assert.equal(Math.round(-deg / STEP), pixels()[tile * rows * size + i]);
			}
			assert.match(anim.bones.strip.position[1], strip);
		});
	}
	check("frame 64×64 entity: 32 packed properties (Bedrock's per-entity maximum), a variant per tile index", () => {
		const def = JSON.parse(read("Vultrom_BP/entities/photo_tile64.json"))["minecraft:entity"];
		const propsDef = def.description.properties;
		assert.equal(Object.keys(propsDef).length, 32);
		for (const p of Object.values(propsDef)) {
			assert.deepEqual(p.range, [0, 2 ** 24 - 1]);
			assert.equal(p.client_sync, true);
		}
		for (let t = 0; t < 32; t++) {
			assert.deepEqual(def.events[`vultrom:tile_${t}`], { add: { component_groups: [`vultrom:tile_${t}`] } });
			assert.deepEqual(def.component_groups[`vultrom:tile_${t}`], { "minecraft:variant": { value: t } });
		}
		const base = JSON.parse(read("Vultrom_BP/entities/photo_tile.json"))["minecraft:entity"];
		assert.deepEqual(def.components, base.components);
	});
	check("frame 64×64 client: far frames skip the drum animation and show the backing instead", () => {
		const client = JSON.parse(read("Vultrom_RP/entity/photo_tile64.entity.json"))["minecraft:client_entity"].description;
		const near = `q.distance_from_camera < ${FRAME_DETAIL_DISTANCE}`;
		assert.deepEqual(client.scripts.animate, [{ pixels: near }]);
		assert.equal(client.geometry.default, "geometry.vultrom.photo_tile64");
		assert.equal(client.animations.pixels, "animation.vultrom.photo_tile64.pixels");
		const rc = JSON.parse(read("Vultrom_RP/render_controllers/photo_tile.render_controllers.json")).render_controllers;
		const vis = Object.assign({}, ...rc[client.render_controllers[0]].part_visibility);
		assert.equal(vis["px_*"], near);
		assert.equal(vis.backing, `q.distance_from_camera >= ${FRAME_DETAIL_DISTANCE}`);
		assert.equal(vis.border_bottom, "q.variant == 31");
		const geo = JSON.parse(read("Vultrom_RP/models/entity/photo_tile64.geo.json"))["minecraft:geometry"][0];
		assert.ok(geo.bones.some((b) => b.name === "backing"));
		for (const lang of ["Vultrom_BP/texts/en_US.lang", "Vultrom_RP/texts/en_US.lang"]) assert.match(read(lang), /^entity\.vultrom:photo_tile64\.name=Photo$/m);
	});
	check("palette: 64 distinct colors, matching the photo_tile property ranges", () => {
		assert.equal(new Set(PALETTE).size, 64);
		const tile = JSON.parse(read("Vultrom_BP/entities/photo_tile.json"))["minecraft:entity"].description.properties;
		assert.deepEqual(tile["vultrom:p15"].range, [0, 2 ** 24 - 1]);
		assert.deepEqual(tile["vultrom:tile"].range, [0, 15]);
	});
}

// ---------- preview: the mock scene at 32×32 and 64×64, as viewer forms and framed pictures ----------
if (process.env.PHOTO_PREVIEW && photo64 && photo32) {
	// prettier-ignore
	const FONT = {
		A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
		F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", K: "101101110101101",
		L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
		Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111",
		V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
		0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110", 4: "101101111001001",
		5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
		".": "000000000000010", "-": "000000111000000", "#": "101111101111101", "(": "001010010010001", ")": "100010010010100", " ": "000000000000000"
	};
	const S = 3;
	const PANEL = 500;
	const U = 32;
	const BG = 0x1e1e1f;
	const img = new Image(1640, 1580);
	img.fill(0, 0, img.width, img.height, BG);
	const text = (x, y, str, color = 0xdedede, k = 4) => {
		for (const ch of str.toUpperCase()) {
			const g = FONT[ch] ?? FONT[" "];
			for (let i = 0; i < 15; i++) if (g[i] === "1") img.fill(x + (i % 3) * k, y + Math.floor(i / 3) * k, k, k, color);
			x += 4 * k;
		}
	};
	/** An ActionForm: title bar, the picture as glyphs (4 colored + 1 gap px each, 10-px lines), buttons. */
	const form = (x, y, title, picture, buttons) => {
		const height = 40 + 20 + 16 * GLYPH.lineHeight * S + 20 + buttons.length * 44 + 8;
		img.fill(x, y, PANEL, height, 0x313233);
		img.fill(x, y, PANEL, 40, 0x48494a);
		text(x + 14, y + 10, title, 0xffffff);
		const ox = x + (PANEL - 32 * GLYPH.advance * S) / 2;
		const oy = y + 60;
		const half = (GLYPH.lineHeight / 2) * S;
		for (let row = 0; row < 16; row++) {
			for (let c = 0; c < 32; c++) {
				img.fill(ox + c * GLYPH.advance * S, oy + row * GLYPH.lineHeight * S, GLYPH.inkWidth * S, half, PALETTE[picture[row * 64 + c]]);
				img.fill(ox + c * GLYPH.advance * S, oy + row * GLYPH.lineHeight * S + half, GLYPH.inkWidth * S, half, PALETTE[picture[row * 64 + 32 + c]]);
			}
		}
		buttons.forEach((label, i) => {
			const by = oy + 16 * GLYPH.lineHeight * S + 20 + i * 44;
			img.fill(x + 16, by, PANEL - 32, 36, 0x5a5b5c);
			text(x + PANEL / 2 - label.length * 8, by + 8, label, 0xffffff);
		});
		return height;
	};
	const framed = (x, y, pixels, size) => {
		img.fill(x - 16, y - 16, 16 * U + 32, 16 * U + 32, 0x7d7d7d);
		img.fill(x, y, 16 * U, 16 * U, FRAME_COLORS.front);
		const p = framePixel(size) * U;
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) img.fill(Math.round(x + U + c * p), Math.round(y + U + r * p), Math.ceil(p), Math.ceil(p), PALETTE[pixels[r * size + c]]);
		}
	};
	const cols = [24, 24 + PANEL + 32, 24 + 2 * (PANEL + 32) + 16];
	text(cols[0], 24, "32x32 (v0.1.10 photos) - viewer", 0xffd27a);
	text(cols[2] - 16, 24, "frame - 16 entities", 0xffd27a);
	const h1 = form(cols[0], 64, "Photo #7", photo32, ["Close"]);
	text(cols[1] + 40, 64 + 260, "fits one page", 0x8a8a8a);
	framed(cols[2], 80, photo32, 32);
	const y2 = 64 + Math.max(h1, 16 * U + 32) + 48;
	text(cols[0], y2, "64x64 (v0.1.11) - overview", 0xffd27a);
	text(cols[1], y2, "top left quarter", 0xffd27a);
	text(cols[2] - 16, y2, "frame - 32 entities", 0xffd27a);
	const quarter = core.crop(photo64, 64, 0, 0, 32);
	form(cols[0], y2 + 40, "Photo #1", core.downsample(photo64, 64), ["Top left", "Top right", "Bottom left", "Bottom right", "Close"]);
	form(cols[1], y2 + 40, "Photo #1 - top left", quarter, ["Back", "Close"]);
	framed(cols[2], y2 + 56, photo64, 64);
	writeFileSync(process.env.PHOTO_PREVIEW, img.encode());
	console.log(`preview written to ${process.env.PHOTO_PREVIEW}`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
