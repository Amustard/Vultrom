// Runs Vultrom_BP/scripts/main.js against a mock @minecraft/server and a model of Bedrock
// component groups (adding a group overwrites its components, removing one deletes them,
// base components included; events apply "remove" before "add").
// Run from the repo root: node tools/mock-test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
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
	class ItemStack {
		constructor(typeId, amount = 1) {
			this.typeId = typeId;
			this.amount = amount;
			this.lore = [];
		}
		setLore(l) {
			this.lore = l;
		}
		getComponent() {
			return undefined;
		}
	}
	const blocks = new Map();
	const spawnedItems = [];
	const entities = [];
	const dimension = {
		id: "minecraft:overworld",
		getBlock: ({ x, y, z }) => ({ typeId: blocks.get(`${x},${y},${z}`) ?? (y < 0 ? "minecraft:deepslate" : "minecraft:stone"), location: { x, y, z } }),
		setBlockType: ({ x, y, z }, id) => blocks.set(`${x},${y},${z}`, id),
		getEntities: (q) => entities.filter((e) => e.typeId === q.type && e.isValid()),
		spawnItem: (stack, loc) => spawnedItems.push({ stack, loc }),
		spawnParticle() {},
		playSound() {}
	};
	const players = [];
	const known = new Set(["vultrom:sapphire_ore", "vultrom:ruby_ore", "vultrom:deepslate_ruby_ore", "vultrom:gemstone_cutter"]);
	const server = {
		world: {
			beforeEvents: { playerInteractWithBlock: sub("pib"), playerInteractWithEntity: sub("pie"), chatSend: sub("chat") },
			afterEvents: { playerBreakBlock: sub("break"), entityLoad: sub("load") },
			getAllPlayers: () => players,
			getDimension: () => dimension,
			playSound() {}
		},
		system,
		BlockTypes: { get: (id) => (known.has(id) ? { id } : undefined) },
		ItemStack,
		GameMode: { creative: "creative", survival: "survival" }
	};
	return { server, fire, tick, system, dimension, entities, players, blocks, spawnedItems };
}

let loadCount = 0;
async function loadScript(env) {
	globalThis.__mc = env.server;
	const src = read("Vultrom_BP/scripts/main.js").replace(
		/^import \{([^}]+)\} from "@minecraft\/server";/m,
		"const {$1} = globalThis.__mc;"
	);
	const dir = mkdtempSync(join(tmpdir(), "vultrom-"));
	const file = join(dir, `main-${loadCount++}.mjs`);
	writeFileSync(file, src);
	const origLog = console.log;
	console.log = () => {};
	try {
		await import(pathToFileURL(file).href);
	} finally {
		console.log = origLog;
	}
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
		typeId: "minecraft:player",
		location: { x: 0, y: 64, z: 0 },
		rot: { x: 0, y: 0 },
		dimension: env.dimension,
		isSneaking: false,
		selectedSlotIndex: 0,
		messages: [],
		actionBar: [],
		isValid: () => true,
		getRotation() {
			return this.rot;
		},
		getGameMode: () => "survival",
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

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
