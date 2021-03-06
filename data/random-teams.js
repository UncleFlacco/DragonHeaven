'use strict';

const Dex = require('./../sim/dex');
const PRNG = require('./../sim/prng');

const randomBSSFactorySets = require('./bss-factory-sets.json');
const randomFactorySets = require('./factory-sets.json');

class RandomTeams extends Dex.ModdedDex {
	constructor(format, seed) {
		format = Dex.getFormat(format);
		super(format.mod);
		this.randomBSSFactorySets = randomBSSFactorySets;
		this.randomFactorySets = randomFactorySets;

		this.factoryTier = '';
		this.format = format;
		this.prng = new PRNG(seed);
	}
	generateTeam() {
		const generatorName = typeof this.format.team === 'string' && this.format.team.startsWith('random') ? this.format.team + 'Team' : '';
		return this[generatorName || 'randomTeam']();
	}
	random(m, n) {
		return this.prng.next(m, n);
	}
	/**
	 * Remove an element from an unsorted array significantly faster
	 * than .splice
	 *
	 * @param {any[]} list
	 * @param {number} index
	 */
	fastPop(list, index) {
		// If an array doesn't need to be in order, replacing the
		// element at the given index with the removed element
		// is much, much faster than using list.splice(index, 1).
		let length = list.length;
		let element = list[index];
		list[index] = list[length - 1];
		list.pop();
		return element;
	}
	/**
	 * Remove a random element from an unsorted array and return it.
	 * Uses the battle's RNG if in a battle.
	 *
	 * @param {any[]} list
	 */
	sampleNoReplace(list) {
		let length = list.length;
		let index = this.random(length);
		return this.fastPop(list, index);
	}
	checkBattleForme(template) {
		// If the Pokémon has a Mega or Primal alt forme, that's its preferred battle forme.
		// No randomization, no choice. We are just checking its existence.
		// Returns a Pokémon template for further details.
		if (!template.otherFormes) return null;
		let firstForme = this.getTemplate(template.otherFormes[0]);
		if (firstForme.isMega || firstForme.isPrimal) return firstForme;
		return null;
	}
	// checkAbilities(selectedAbilities, defaultAbilities) {
	// 	if (!selectedAbilities.length) return true;
	// 	let selectedAbility = selectedAbilities.pop();
	// 	let isValid = false;
	// 	for (let i = 0; i < defaultAbilities.length; i++) {
	// 		let defaultAbility = defaultAbilities[i];
	// 		if (!defaultAbility) break;
	// 		if (defaultAbility.includes(selectedAbility)) {
	// 			defaultAbilities.splice(i, 1);
	// 			isValid = this.checkAbilities(selectedAbilities, defaultAbilities);
	// 			if (isValid) break;
	// 			defaultAbilities.splice(i, 0, defaultAbility);
	// 		}
	// 	}
	// 	if (!isValid) selectedAbilities.push(selectedAbility);
	// 	return isValid;
	// }
	// hasMegaEvo(template) {
	// 	if (!template.otherFormes) return false;
	// 	let firstForme = this.getTemplate(template.otherFormes[0]);
	// 	return !!firstForme.isMega;
	// }
	randomCCTeam() {
		let team = [];

		let natures = Object.keys(this.data.Natures);
		let items = Object.keys(this.data.Items);

		let random6 = this.random6Pokemon();

		for (let i = 0; i < 6; i++) {
			let species = random6[i];
			let template = this.getTemplate(species);

			// Random legal item
			let item = '';
			if (this.gen >= 2) {
				do {
					item = items[this.random(items.length)];
				} while (this.getItem(item).gen > this.gen || this.data.Items[item].isNonstandard);
			}

			// Make sure forme is legal
			if (template.battleOnly || template.requiredItems && !template.requiredItems.some(req => toId(req) === item)) {
				template = this.getTemplate(template.baseSpecies);
				species = template.name;
			}

			// Make sure that a base forme does not hold any forme-modifier items.
			let itemData = this.getItem(item);
			if (itemData.forcedForme && species === this.getTemplate(itemData.forcedForme).baseSpecies) {
				do {
					item = items[this.random(items.length)];
					itemData = this.getItem(item);
				} while (itemData.gen > this.gen || itemData.isNonstandard || itemData.forcedForme && species === this.getTemplate(itemData.forcedForme).baseSpecies);
			}

			// Random legal ability
			let abilities = Object.values(template.abilities).filter(a => this.getAbility(a).gen <= this.gen);
			let ability = this.gen <= 2 ? 'None' : abilities[this.random(abilities.length)];

			// Four random unique moves from the movepool
			let moves;
			let pool = ['struggle'];
			if (species === 'Smeargle') {
				pool = Object.keys(this.data.Movedex).filter(moveid => !(['chatter', 'struggle', 'paleowave', 'shadowstrike', 'magikarpsrevenge'].includes(moveid) || this.data.Movedex[moveid].isZ));
			} else if (template.learnset) {
				pool = Object.keys(template.learnset);
				if (template.species.substr(0, 6) === 'Rotom-') {
					pool = Array.from(new Set(pool.concat(Object.keys(this.getTemplate(template.baseSpecies).learnset))));
				}
			} else {
				const learnset = this.getTemplate(template.baseSpecies).learnset;
				pool = Object.keys(learnset);
			}
			if (pool.length <= 4) {
				moves = pool;
			} else {
				moves = [this.sampleNoReplace(pool), this.sampleNoReplace(pool), this.sampleNoReplace(pool), this.sampleNoReplace(pool)];
			}

			// Random EVs
			let evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			let s = ["hp", "atk", "def", "spa", "spd", "spe"];
			let evpool = 510;
			do {
				let x = s[this.random(s.length)];
				let y = this.random(Math.min(256 - evs[x], evpool + 1));
				evs[x] += y;
				evpool -= y;
			} while (evpool > 0);

			// Random IVs
			let ivs = {hp: this.random(32), atk: this.random(32), def: this.random(32), spa: this.random(32), spd: this.random(32), spe: this.random(32)};

			// Random nature
			let nature = natures[this.random(natures.length)];

			// Level balance--calculate directly from stats rather than using some silly lookup table
			let mbstmin = 1307; // Sunkern has the lowest modified base stat total, and that total is 807

			let stats = template.baseStats;
			// If Wishiwashi, use the school-forme's much higher stats
			if (template.baseSpecies === 'Wishiwashi') stats = Dex.getTemplate('wishiwashischool').baseStats;

			// Modified base stat total assumes 31 IVs, 85 EVs in every stat
			let mbst = (stats["hp"] * 2 + 31 + 21 + 100) + 10;
			mbst += (stats["atk"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["def"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spa"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spd"] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats["spe"] * 2 + 31 + 21 + 100) + 5;

			let level = Math.floor(100 * mbstmin / mbst); // Initial level guess will underestimate

			while (level < 100) {
				mbst = Math.floor((stats["hp"] * 2 + 31 + 21 + 100) * level / 100 + 10);
				mbst += Math.floor(((stats["atk"] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100); // Since damage is roughly proportional to level
				mbst += Math.floor((stats["def"] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor(((stats["spa"] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats["spd"] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor((stats["spe"] * 2 + 31 + 21 + 100) * level / 100 + 5);

				if (mbst >= mbstmin) break;
				level++;
			}

			// Random gender--already handled by PS

			// Random happiness
			let happiness = this.random(256);

			// Random shininess
			let shiny = !this.random(1024);

			team.push({
				name: template.baseSpecies,
				species: template.species,
				item: item,
				ability: ability,
				moves: moves,
				evs: evs,
				ivs: ivs,
				nature: nature,
				level: level,
				happiness: happiness,
				shiny: shiny,
			});
		}

		return team;
	}
	random6Pokemon() {
		// Pick six random pokemon--no repeats, even among formes
		// Also need to either normalize for formes or select formes at random
		// Unreleased are okay but no CAP
		let last = [0, 151, 251, 386, 493, 649, 721, 802][this.gen];
		let hasDexNumber = {};
		for (let i = 0; i < 6; i++) {
			let num;
			do {
				num = this.random(last) + 1;
			} while (num in hasDexNumber);
			hasDexNumber[num] = i;
		}

		let formes = [[], [], [], [], [], []];
		for (let id in this.data.Pokedex) {
			if (!(this.data.Pokedex[id].num in hasDexNumber)) continue;
			let template = this.getTemplate(id);
			if (template.gen <= this.gen && template.species !== 'Pichu-Spiky-eared' && template.species.substr(0, 8) !== 'Pikachu-') {
				formes[hasDexNumber[template.num]].push(template.species);
			}
		}

		let sixPokemon = [];
		for (let i = 0; i < 6; i++) {
			if (!formes[i].length) {
				throw new Error("Invalid pokemon gen " + this.gen + ": " + JSON.stringify(formes) + " numbers " + JSON.stringify(hasDexNumber));
			}
			sixPokemon.push(formes[i][this.random(formes[i].length)]);
		}
		return sixPokemon;
	}
	randomHCTeam() {
		let team = [];

		let itemPool = Object.keys(this.data.Items);
		let abilityPool = Object.keys(this.data.Abilities);
		let movePool = Object.keys(this.data.Movedex);
		let naturePool = Object.keys(this.data.Natures);

		let random6 = this.random6Pokemon();

		for (let i = 0; i < 6; i++) {
			// Choose forme
			let template = this.getTemplate(random6[i]);

			// Random unique item
			let item = '';
			if (this.gen >= 2) {
				do {
					item = this.sampleNoReplace(itemPool);
				} while (this.getItem(item).gen > this.gen || this.data.Items[item].isNonstandard);
			}

			// Random unique ability
			let ability = 'None';
			if (this.gen >= 3) {
				do {
					ability = this.sampleNoReplace(abilityPool);
				} while (this.getAbility(ability).gen > this.gen || this.data.Abilities[ability].isNonstandard);
			}

			// Random unique moves
			let m = [];
			do {
				let moveid = this.sampleNoReplace(movePool);
				if (this.getMove(moveid).gen <= this.gen && !this.data.Movedex[moveid].isNonstandard && (moveid === 'hiddenpower' || moveid.substr(0, 11) !== 'hiddenpower')) {
					m.push(moveid);
				}
			} while (m.length < 4);

			// Random EVs
			let evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
			let s = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
			if (this.gen === 6) {
				let evpool = 510;
				do {
					let x = s[this.random(s.length)];
					let y = this.random(Math.min(256 - evs[x], evpool + 1));
					evs[x] += y;
					evpool -= y;
				} while (evpool > 0);
			} else {
				for (let x of s) evs[x] = this.random(256);
			}

			// Random IVs
			let ivs = {hp: this.random(32), atk: this.random(32), def: this.random(32), spa: this.random(32), spd: this.random(32), spe: this.random(32)};

			// Random nature
			let nature = naturePool[this.random(naturePool.length)];

			// Level balance
			let mbstmin = 1307;
			let stats = template.baseStats;
			let mbst = (stats['hp'] * 2 + 31 + 21 + 100) + 10;
			mbst += (stats['atk'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['def'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spa'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spd'] * 2 + 31 + 21 + 100) + 5;
			mbst += (stats['spe'] * 2 + 31 + 21 + 100) + 5;
			let level = Math.floor(100 * mbstmin / mbst);
			while (level < 100) {
				mbst = Math.floor((stats['hp'] * 2 + 31 + 21 + 100) * level / 100 + 10);
				mbst += Math.floor(((stats['atk'] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats['def'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor(((stats['spa'] * 2 + 31 + 21 + 100) * level / 100 + 5) * level / 100);
				mbst += Math.floor((stats['spd'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				mbst += Math.floor((stats['spe'] * 2 + 31 + 21 + 100) * level / 100 + 5);
				if (mbst >= mbstmin) break;
				level++;
			}

			// Random happiness
			let happiness = this.random(256);

			// Random shininess
			let shiny = !this.random(1024);

			team.push({
				name: template.baseSpecies,
				species: template.species,
				item: item,
				ability: ability,
				moves: m,
				evs: evs,
				ivs: ivs,
				nature: nature,
				level: level,
				happiness: happiness,
				shiny: shiny,
			});
		}

		return team;
	}
	queryMoves(moves, hasType, hasAbility, movePool) {
		// This is primarily a helper function for random setbuilder functions.
		let counter = {
			Physical: 0, Special: 0, Status: 0, damage: 0, recovery: 0, stab: 0, inaccurate: 0, priority: 0, recoil: 0, drain: 0,
			adaptability: 0, bite: 0, contrary: 0, hustle: 0, ironfist: 0, serenegrace: 0, sheerforce: 0, skilllink: 0, technician: 0,
			physicalsetup: 0, specialsetup: 0, mixedsetup: 0, defensesetup: 0, speedsetup: 0, physicalpool: 0, specialpool: 0,
			damagingMoves: [],
			damagingMoveIndex: {},
			setupType: '',
		};

		for (let type in Dex.data.TypeChart) {
			counter[type] = 0;
		}

		if (!moves || !moves.length) return counter;
		if (!hasType) hasType = {};
		if (!hasAbility) hasAbility = {};
		if (!movePool) movePool = [];

		// Moves that heal a fixed amount:
		let RecoveryMove = [
			'healorder', 'milkdrink', 'recover', 'roost', 'slackoff', 'softboiled',
		];
		// Moves which drop stats:
		let ContraryMove = [
			'closecombat', 'leafstorm', 'overheat', 'superpower', 'vcreate',
		];
		// Moves that boost Attack:
		let PhysicalSetup = [
			'bellydrum', 'bulkup', 'coil', 'curse', 'dragondance', 'honeclaws', 'howl', 'poweruppunch', 'shiftgear', 'swordsdance',
		];
		// Moves which boost Special Attack:
		let SpecialSetup = [
			'calmmind', 'chargebeam', 'geomancy', 'nastyplot', 'quiverdance', 'tailglow',
		];
		// Moves which boost Attack AND Special Attack:
		let MixedSetup = [
			'conversion', 'growth', 'shellsmash', 'workup',
		];
		// Moves which boost Defense and/or Special Defense:
		let DefenseSetup = [
			'cosmicpower', 'cottonguard', 'defendorder',
		];
		// Moves which boost Speed:
		let SpeedSetup = [
			'agility', 'autotomize', 'rockpolish',
		];
		// Moves that shouldn't be the only STAB moves:
		let NoStab = [
			'aquajet', 'bounce', 'explosion', 'fakeout', 'flamecharge', 'fly', 'iceshard', 'pursuit', 'quickattack', 'skyattack',
			'chargebeam', 'clearsmog', 'eruption', 'vacuumwave', 'waterspout',
		];

		// Iterate through all moves we've chosen so far and keep track of what they do:
		for (let k = 0; k < moves.length; k++) {
			let move = this.getMove(moves[k]);
			let moveid = move.id;
			let movetype = move.type;
			if (moveid === 'judgment' || moveid === 'multiattack') movetype = Object.keys(hasType)[0];
			if (move.damage || move.damageCallback) {
				// Moves that do a set amount of damage:
				counter['damage']++;
				counter.damagingMoves.push(move);
				counter.damagingMoveIndex[moveid] = k;
			} else {
				// Are Physical/Special/Status moves:
				counter[move.category]++;
			}
			// Moves that have a low base power:
			if (moveid === 'lowkick' || (move.basePower && move.basePower <= 60 && moveid !== 'rapidspin')) counter['technician']++;
			// Moves that hit up to 5 times:
			if (move.multihit && move.multihit[1] === 5) counter['skilllink']++;
			if (move.recoil || move.hasCustomRecoil) counter['recoil']++;
			if (move.drain) counter['drain']++;
			// Moves which have a base power, but aren't super-weak like Rapid Spin:
			if (move.basePower > 30 || move.multihit || move.basePowerCallback || moveid === 'naturepower') {
				counter[movetype]++;
				if (hasType[movetype]) {
					counter['adaptability']++;
					// STAB:
					// Certain moves aren't acceptable as a Pokemon's only STAB attack
					if (!(moveid in NoStab) && (moveid !== 'hiddenpower' || Object.keys(hasType).length === 1)) counter['stab']++;
				}
				if (move.priority === 0 && (hasAbility['Protean'] || moves.includes('conversion')) && !(moveid in NoStab)) counter['stab']++;
				if (move.category === 'Physical') counter['hustle']++;
				if (movetype === 'Normal' && !(moveid in NoStab)) {
					if (hasAbility['Aerilate'] || hasAbility['Pixilate'] || hasAbility['Refrigerate']) counter['stab']++;
				}
				if (move.flags['bite']) counter['bite']++;
				if (move.flags['punch']) counter['ironfist']++;
				counter.damagingMoves.push(move);
				counter.damagingMoveIndex[moveid] = k;
			}
			// Moves with secondary effects:
			if (move.secondary) {
				counter['sheerforce']++;
				if (move.secondary.chance >= 20) counter['serenegrace']++;
			}
			// Moves with low accuracy:
			if (move.accuracy && move.accuracy !== true && move.accuracy < 90) counter['inaccurate']++;
			// Moves with non-zero priority:
			if (move.priority !== 0) counter['priority']++;

			// Moves that change stats:
			if (RecoveryMove.includes(moveid)) counter['recovery']++;
			if (ContraryMove.includes(moveid)) counter['contrary']++;
			if (PhysicalSetup.includes(moveid)) counter['physicalsetup']++;
			if (SpecialSetup.includes(moveid)) counter['specialsetup']++;
			if (MixedSetup.includes(moveid)) counter['mixedsetup']++;
			if (DefenseSetup.includes(moveid)) counter['defensesetup']++;
			if (SpeedSetup.includes(moveid)) counter['speedsetup']++;
		}

		// Keep track of the available moves
		for (let i = 0; i < movePool.length; i++) {
			let move = this.getMove(movePool[i]);
			if (move.category === 'Physical') counter['physicalpool']++;
			if (move.category === 'Special') counter['specialpool']++;
		}

		// Choose a setup type:
		if (counter['mixedsetup']) {
			counter.setupType = 'Mixed';
		} else if (counter['physicalsetup'] || counter['specialsetup']) {
			let physical = counter.Physical + counter['physicalpool'];
			let special = counter.Special + counter['specialpool'];
			if (counter['physicalsetup'] && counter['specialsetup']) {
				if (physical === special) {
					counter.setupType = counter.Physical > counter.Special ? 'Physical' : 'Special';
				} else {
					counter.setupType = physical > special ? 'Physical' : 'Special';
				}
			} else if (counter['physicalsetup'] && physical >= 1) {
				if (physical >= 2 || moves.includes('rest') && moves.includes('sleeptalk')) {
					counter.setupType = 'Physical';
				}
			} else if (counter['specialsetup'] && special >= 1) {
				if (special >= 2 || moves.includes('rest') && moves.includes('sleeptalk')) {
					counter.setupType = 'Special';
				}
			}
		}

		return counter;
	}
	randomSet(template, slot, teamDetails) {
		if (slot === undefined) slot = 1;
		let baseTemplate = (template = this.getTemplate(template));
		let species = template.species;

		if (!template.exists || (!template.randomBattleMoves && !template.learnset)) {
			// GET IT? UNOWN? BECAUSE WE CAN'T TELL WHAT THE POKEMON IS
			template = this.getTemplate('unown');

			let err = new Error('Template incompatible with random battles: ' + species);
			require('../lib/crashlogger')(err, 'The randbat set generator');
		}

		if (typeof teamDetails !== 'object') teamDetails = {megaStone: teamDetails};

		if (template.battleOnly) {
			// Only change the species. The template has custom moves, and may have different typing and requirements.
			species = template.baseSpecies;
		}
		let battleForme = this.checkBattleForme(template);
		if (battleForme && battleForme.randomBattleMoves && (battleForme.isMega ? !teamDetails.megaStone : this.random(2))) {
			template = this.getTemplate(template.otherFormes.length >= 2 ? template.otherFormes[this.random(template.otherFormes.length)] : template.otherFormes[0]);
		}

		let movePool = (template.randomBattleMoves ? template.randomBattleMoves.slice() : Object.keys(template.learnset));
		let moves = [];
		let ability = '';
		let item = '';
		let evs = {
			hp: 85,
			atk: 85,
			def: 85,
			spa: 85,
			spd: 85,
			spe: 85,
		};
		let ivs = {
			hp: 31,
			atk: 31,
			def: 31,
			spa: 31,
			spd: 31,
			spe: 31,
		};
		let hasType = {};
		hasType[template.types[0]] = true;
		if (template.types[1]) {
			hasType[template.types[1]] = true;
		}
		let hasAbility = {};
		hasAbility[template.abilities[0]] = true;
		if (template.abilities[1]) {
			hasAbility[template.abilities[1]] = true;
		}
		if (template.abilities['H']) {
			hasAbility[template.abilities['H']] = true;
		}
		let availableHP = 0;
		for (let i = 0, len = movePool.length; i < len; i++) {
			if (movePool[i].substr(0, 11) === 'hiddenpower') availableHP++;
		}

		// These moves can be used even if we aren't setting up to use them:
		let SetupException = [
			'closecombat', 'extremespeed', 'suckerpunch', 'superpower',
			'clangingscales', 'dracometeor', 'leafstorm', 'overheat',
		];
		let counterAbilities = [
			'Adaptability', 'Contrary', 'Hustle', 'Iron Fist', 'Skill Link',
		];
		let ateAbilities = [
			'Aerilate', 'Galvanize', 'Pixilate', 'Refrigerate',
		];

		let hasMove, counter;

		do {
			// Keep track of all moves we have:
			hasMove = {};
			for (let k = 0; k < moves.length; k++) {
				if (moves[k].substr(0, 11) === 'hiddenpower') {
					hasMove['hiddenpower'] = true;
				} else {
					hasMove[moves[k]] = true;
				}
			}

			// Choose next 4 moves from learnset/viable moves and add them to moves list:
			while (moves.length < 4 && movePool.length) {
				let moveid = this.sampleNoReplace(movePool);
				if (moveid.substr(0, 11) === 'hiddenpower') {
					availableHP--;
					if (hasMove['hiddenpower']) continue;
					hasMove['hiddenpower'] = true;
				} else {
					hasMove[moveid] = true;
				}
				moves.push(moveid);
			}

			counter = this.queryMoves(moves, hasType, hasAbility, movePool);

			// Iterate through the moves again, this time to cull them:
			for (let k = 0; k < moves.length; k++) {
				let move = this.getMove(moves[k]);
				let moveid = move.id;
				let rejected = false;
				let isSetup = false;

				switch (moveid) {
				// Not very useful without their supporting moves
				case 'batonpass':
					if (!counter.setupType && !counter['speedsetup'] && !hasMove['substitute'] && !hasMove['wish'] && !hasAbility['Speed Boost']) rejected = true;
					break;
				case 'clangingscales':
					if (teamDetails.zMove) rejected = true;
					break;
				case 'focuspunch':
					if (!hasMove['substitute'] || counter.damagingMoves.length < 2) rejected = true;
					break;
				case 'perishsong':
					if (!hasMove['protect']) rejected = true;
					break;
				case 'reflect':
					if (!hasMove['calmmind'] && !hasMove['lightscreen']) rejected = true;
					if (movePool.length > 1) {
						let screen = movePool.indexOf('lightscreen');
						if (screen >= 0) this.fastPop(movePool, screen);
					}
					break;
				case 'rest': {
					if (movePool.includes('sleeptalk')) rejected = true;
					break;
				}
				case 'sleeptalk':
					if (!hasMove['rest']) rejected = true;
					if (movePool.length > 1) {
						let rest = movePool.indexOf('rest');
						if (rest >= 0) this.fastPop(movePool, rest);
					}
					break;
				case 'storedpower':
					if (!counter.setupType && !hasMove['cosmicpower']) rejected = true;
					break;

				// Set up once and only if we have the moves for it
				case 'bellydrum': case 'bulkup': case 'coil': case 'curse': case 'dragondance': case 'honeclaws': case 'swordsdance':
					if (counter.setupType !== 'Physical' || counter['physicalsetup'] > 1) {
						if (!hasMove['growth'] || hasMove['sunnyday']) rejected = true;
					}
					if (counter.Physical + counter['physicalpool'] < 2 && !hasMove['batonpass'] && (!hasMove['rest'] || !hasMove['sleeptalk'])) rejected = true;
					isSetup = true;
					break;
				case 'calmmind': case 'geomancy': case 'nastyplot': case 'quiverdance': case 'tailglow':
					if (counter.setupType !== 'Special' || counter['specialsetup'] > 1) rejected = true;
					if (counter.Special + counter['specialpool'] < 2 && !hasMove['batonpass'] && (!hasMove['rest'] || !hasMove['sleeptalk'])) rejected = true;
					isSetup = true;
					break;
				case 'growth': case 'shellsmash': case 'workup':
					if (counter.setupType !== 'Mixed' || counter['mixedsetup'] > 1) rejected = true;
					if (counter.damagingMoves.length + counter['physicalpool'] + counter['specialpool'] < 2 && !hasMove['batonpass']) rejected = true;
					if (moveid === 'growth' && !hasMove['sunnyday']) rejected = true;
					isSetup = true;
					break;
				case 'agility': case 'autotomize': case 'rockpolish':
					if (counter.damagingMoves.length < 2 && !hasMove['batonpass']) rejected = true;
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (!counter.setupType) isSetup = true;
					break;
				case 'flamecharge':
					if (counter.damagingMoves.length < 3 && !counter.setupType && !hasMove['batonpass']) rejected = true;
					if (hasMove['dracometeor'] || hasMove['overheat']) rejected = true;
					break;
				case 'conversion':
					if (teamDetails.zMove || hasMove['triattack']) rejected = true;
					break;

				// Bad after setup
				case 'circlethrow': case 'dragontail':
					if (counter.setupType && ((!hasMove['rest'] && !hasMove['sleeptalk']) || hasMove['stormthrow'])) rejected = true;
					if (!!counter['speedsetup'] || hasMove['encore'] || hasMove['raindance'] || hasMove['roar'] || hasMove['whirlwind']) rejected = true;
					break;
				case 'defog':
					if (counter.setupType || hasMove['spikes'] || (hasMove['rest'] && hasMove['sleeptalk']) || teamDetails.hazardClear) rejected = true;
					break;
				case 'fakeout': case 'superfang':
					if (counter.setupType || hasMove['substitute'] || hasMove['switcheroo'] || hasMove['trick']) rejected = true;
					break;
				case 'foulplay':
					if (counter.setupType || !!counter['speedsetup'] || counter['Dark'] > 2 || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					if (counter.damagingMoves.length - 1 === counter['priority']) rejected = true;
					break;
				case 'haze': case 'spikes': case 'waterspout':
					if (counter.setupType || !!counter['speedsetup'] || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					break;
				case 'healbell':
					if (counter['speedsetup']) rejected = true;
					break;
				case 'healingwish': case 'memento':
					if (counter.setupType || !!counter['recovery'] || hasMove['substitute']) rejected = true;
					break;
				case 'leechseed': case 'roar': case 'whirlwind':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['dragontail']) rejected = true;
					break;
				case 'nightshade': case 'seismictoss':
					if (counter.damagingMoves.length > 1 || counter.setupType) rejected = true;
					break;
				case 'protect':
					if (counter.setupType && (hasAbility['Guts'] || hasAbility['Speed Boost']) && !hasMove['batonpass']) rejected = true;
					if ((hasMove['lightscreen'] && hasMove['reflect']) || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					break;
				case 'pursuit':
					if (counter.setupType || (hasMove['rest'] && hasMove['sleeptalk']) || (hasMove['knockoff'] && !hasType['Dark'])) rejected = true;
					break;
				case 'rapidspin':
					if (counter.setupType || teamDetails.hazardClear) rejected = true;
					break;
				case 'reversal':
					if (hasMove['substitute'] && teamDetails.zMove) rejected = true;
					break;
				case 'stealthrock':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['rest'] || teamDetails.stealthRock) rejected = true;
					break;
				case 'switcheroo': case 'trick':
					if (counter.Physical + counter.Special < 3 || counter.setupType) rejected = true;
					if (hasMove['acrobatics'] || hasMove['lightscreen'] || hasMove['reflect'] || hasMove['suckerpunch'] || hasMove['trickroom']) rejected = true;
					break;
				case 'toxicspikes':
					if (counter.setupType || teamDetails.toxicSpikes) rejected = true;
					break;
				case 'trickroom':
					if (counter.setupType || !!counter['speedsetup'] || counter.damagingMoves.length < 2) rejected = true;
					if (hasMove['lightscreen'] || hasMove['reflect']) rejected = true;
					break;
				case 'uturn':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['batonpass'] || hasAbility['Protean'] && counter.Status > 2) rejected = true;
					if (hasType['Bug'] && counter.stab < 2 && counter.damagingMoves.length > 2 && !hasAbility['Adaptability'] && !hasMove['technoblast']) rejected = true;
					break;
				case 'voltswitch':
					if (counter.setupType || !!counter['speedsetup'] || hasMove['batonpass'] || hasMove['magnetrise'] || hasMove['uturn']) rejected = true;
					if (hasMove['nuzzle'] && hasMove['thunderbolt']) rejected = true;
					break;

				// Bit redundant to have both
				// Attacks:
				case 'bugbite': case 'bugbuzz': case 'signalbeam':
					if (hasMove['uturn'] && !counter.setupType) rejected = true;
					break;
				case 'lunge':
					if (hasMove['leechlife']) rejected = true;
					break;
				case 'darkpulse':
					if (hasMove['shadowball']) rejected = true;
					if ((hasMove['crunch'] || hasMove['hyperspacefury']) && counter.setupType !== 'Special') rejected = true;
					break;
				case 'suckerpunch':
					if (counter['Dark'] > 2 || (counter.setupType === 'Special' && hasType['Dark'] && counter.stab < 2)) rejected = true;
					if (counter['Dark'] > 1 && !hasType['Dark']) rejected = true;
					if (counter.damagingMoves.length < 2 || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'dragonclaw':
					if (hasMove['dragontail'] || hasMove['outrage'] && counter.Status >= 1) rejected = true;
					break;
				case 'dracometeor':
					if (hasMove['swordsdance'] || counter.setupType === 'Physical' && hasMove['outrage']) rejected = true;
					break;
				case 'dragonpulse': case 'spacialrend':
					if (hasMove['dracometeor'] || hasMove['outrage']) rejected = true;
					break;
				case 'outrage':
					if (hasMove['dracometeor'] && counter.damagingMoves.length < 3) rejected = true;
					if (hasMove['clangingscales'] && !teamDetails.zMove) rejected = true;
					break;
				case 'chargebeam':
					if (hasMove['thunderbolt'] && counter.Special < 3) rejected = true;
					break;
				case 'thunder':
					if (hasMove['thunderbolt'] && !hasMove['raindance']) rejected = true;
					break;
				case 'thunderbolt':
					if (hasMove['discharge'] || (hasMove['raindance'] && hasMove['thunder']) || (hasMove['voltswitch'] && hasMove['wildcharge'])) rejected = true;
					if (!counter.setupType && !counter['speedsetup'] && hasMove['voltswitch'] && template.types.length > 1 && !counter[template.types.find(type => type !== 'Electric')]) rejected = true;
					break;
				case 'thunderpunch':
					if (hasAbility['Galvanize'] && !!counter['Normal']) rejected = true;
					break;
				case 'dazzlinggleam':
					if (hasMove['playrough'] && counter.setupType !== 'Special') rejected = true;
					break;
				case 'drainingkiss':
					if (hasMove['dazzlinggleam'] || counter.setupType !== 'Special' && !hasAbility['triage']) rejected = true;
					break;
				case 'aurasphere': case 'focusblast':
					if ((hasMove['closecombat'] || hasMove['superpower']) && counter.setupType !== 'Special') rejected = true;
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'drainpunch':
					if (!hasMove['bulkup'] && (hasMove['closecombat'] || hasMove['highjumpkick'])) rejected = true;
					if ((hasMove['focusblast'] || hasMove['superpower']) && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'closecombat': case 'highjumpkick':
					if ((hasMove['aurasphere'] || hasMove['focusblast'] || movePool.includes('aurasphere')) && counter.setupType === 'Special') rejected = true;
					if (hasMove['bulkup'] && hasMove['drainpunch']) rejected = true;
					break;
				case 'machpunch':
					if (hasType['Fighting'] && counter.stab < 2 && !hasAbility['Technician']) rejected = true;
					break;
				case 'stormthrow':
					if (hasMove['circlethrow'] && hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'superpower':
					if (counter['Fighting'] > 1 && counter.setupType) rejected = true;
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'vacuumwave':
					if ((hasMove['closecombat'] || hasMove['machpunch']) && counter.setupType !== 'Special') rejected = true;
					break;
				case 'blazekick':
					if (hasMove['flamethrower'] && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'fierydance': case 'firefang': case 'flamethrower':
					if ((hasMove['fireblast'] && counter.setupType !== 'Physical') || hasMove['overheat']) rejected = true;
					break;
				case 'fireblast':
					if (hasMove['flareblitz'] && counter.setupType !== 'Special') rejected = true;
					if (hasMove['lavaplume'] && !counter.setupType && !counter['speedsetup']) rejected = true;
					if (hasMove['mindblown'] && counter.setupType) rejected = true;
					break;
				case 'firepunch': case 'sacredfire':
					if (hasMove['fireblast'] || hasMove['flareblitz']) rejected = true;
					break;
				case 'lavaplume':
					if (hasMove['firepunch'] || hasMove['fireblast'] && (counter.setupType || !!counter['speedsetup'])) rejected = true;
					break;
				case 'overheat':
					if (hasMove['lavaplume'] || counter.setupType === 'Special') rejected = true;
					break;
				case 'acrobatics':
					if (hasMove['hurricane'] && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'airslash': case 'oblivionwing':
					if (hasMove['acrobatics'] || hasMove['bravebird'] || hasMove['hurricane']) rejected = true;
					break;
				case 'fly':
					if (teamDetails.zMove || counter.setupType !== 'Physical') rejected = true;
					break;
				case 'hex':
					if (!hasMove['willowisp']) rejected = true;
					break;
				case 'shadowball':
					if (hasMove['hex'] && hasMove['willowisp']) rejected = true;
					break;
				case 'shadowclaw':
					if (hasMove['phantomforce'] || (hasMove['shadowball'] && counter.setupType !== 'Physical') || hasMove['shadowsneak']) rejected = true;
					break;
				case 'shadowsneak':
					if (hasType['Ghost'] && template.types.length > 1 && counter.stab < 2) rejected = true;
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'solarbeam':
					if ((!hasAbility['Drought'] && !hasMove['sunnyday']) || hasMove['gigadrain'] || hasMove['leafstorm']) rejected = true;
					break;
				case 'gigadrain':
					if (hasMove['seedbomb'] || hasMove['petaldance'] || counter.Special < 4 && !counter.setupType && hasMove['leafstorm']) rejected = true;
					break;
				case 'leafblade': case 'woodhammer':
					if (hasMove['gigadrain'] && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'leafstorm':
					if (counter['Grass'] > 1 && counter.setupType) rejected = true;
					break;
				case 'bonemerang': case 'precipiceblades':
					if (hasMove['earthquake']) rejected = true;
					break;
				case 'earthpower':
					if (hasMove['earthquake'] && counter.setupType !== 'Special') rejected = true;
					break;
				case 'icebeam':
					if (hasMove['blizzard'] || hasMove['freezedry']) rejected = true;
					break;
				case 'iceshard':
					if (hasMove['freezedry']) rejected = true;
					break;
				case 'bodyslam':
					if (hasMove['glare'] && hasMove['headbutt']) rejected = true;
					break;
				case 'endeavor':
					if (slot > 0) rejected = true;
					break;
				case 'explosion':
					if (counter.setupType || (hasAbility['Refrigerate'] && hasMove['freezedry']) || hasMove['wish']) rejected = true;
					break;
				case 'extremespeed':
					if (counter.setupType !== 'Physical' && hasMove['vacuumwave']) rejected = true;
					break;
				case 'facade':
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'hiddenpower':
					if (hasMove['rest'] || !counter.stab && counter.damagingMoves.length < 2) rejected = true;
					break;
				case 'hypervoice':
					if (hasMove['blizzard'] || hasMove['naturepower'] || hasMove['return']) rejected = true;
					break;
				case 'judgment':
					if (counter.setupType !== 'Special' && counter.stab > 1) rejected = true;
					break;
				case 'quickattack':
					if (hasType['Normal'] && (!counter.stab || counter['Normal'] > 2)) rejected = true;
					break;
				case 'return': case 'rockclimb':
					if (hasMove['bodyslam'] || hasMove['doubleedge']) rejected = true;
					break;
				case 'weatherball':
					if (!hasMove['raindance'] && !hasMove['sunnyday']) rejected = true;
					break;
				case 'acidspray':
					if (hasMove['sludgebomb'] || counter.Special < 2) rejected = true;
					break;
				case 'poisonjab':
					if (hasMove['gunkshot']) rejected = true;
					break;
				case 'sludgewave':
					if (hasMove['poisonjab']) rejected = true;
					break;
				case 'psychic':
					if (hasMove['psyshock'] || hasMove['storedpower']) rejected = true;
					break;
				case 'psychocut': case 'zenheadbutt':
					if ((hasMove['psychic'] || hasMove['psyshock']) && counter.setupType !== 'Physical') rejected = true;
					break;
				case 'psyshock':
					if (movePool.length > 1) {
						let psychic = movePool.indexOf('psychic');
						if (psychic >= 0) this.fastPop(movePool, psychic);
					}
					break;
				case 'headsmash':
					if (hasMove['stoneedge']) rejected = true;
					break;
				case 'rockblast': case 'rockslide':
					if (hasMove['headsmash'] || hasMove['stoneedge']) rejected = true;
					break;
				case 'bulletpunch':
					if (hasType['Steel'] && counter.stab < 2 && !hasAbility['Adaptability'] && !hasAbility['Technician']) rejected = true;
					break;
				case 'flashcannon':
					if (hasMove['ironhead']) rejected = true;
					break;
				case 'hydropump':
					if (hasMove['razorshell'] || hasMove['waterfall'] || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					if (hasMove['scald'] && (counter.Special < 4 || template.types.length > 1 && counter.stab < 3)) rejected = true;
					break;
				case 'originpulse': case 'surf':
					if (hasMove['hydropump'] || hasMove['scald']) rejected = true;
					break;
				case 'scald':
					if (hasMove['liquidation'] || hasMove['waterfall'] || hasMove['waterpulse']) rejected = true;
					break;

				// Status:
				case 'raindance':
					if (counter.Physical + counter.Special < 2 || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (!hasType['Water'] && !hasMove['thunder']) rejected = true;
					break;
				case 'sunnyday':
					if (counter.Physical + counter.Special < 2 || hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (!hasAbility['Chlorophyll'] && !hasAbility['Flower Gift'] && !hasMove['solarbeam']) rejected = true;
					if (rejected && movePool.length > 1) {
						let solarbeam = movePool.indexOf('solarbeam');
						if (solarbeam >= 0) this.fastPop(movePool, solarbeam);
						if (movePool.length > 1) {
							let weatherball = movePool.indexOf('weatherball');
							if (weatherball >= 0) this.fastPop(movePool, weatherball);
						}
					}
					break;
				case 'stunspore': case 'thunderwave':
					if (counter.setupType || !!counter['speedsetup'] || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					if (hasMove['discharge'] || hasMove['gyroball'] || hasMove['spore'] || hasMove['toxic'] || hasMove['trickroom'] || hasMove['yawn']) rejected = true;
					break;
				case 'toxic':
					if (counter.setupType || hasMove['flamecharge'] || hasMove['hypnosis'] || hasMove['sleeppowder'] || hasMove['willowisp'] || hasMove['yawn']) rejected = true;
					break;
				case 'willowisp':
					if (hasMove['scald']) rejected = true;
					break;
				case 'milkdrink': case 'moonlight': case 'painsplit': case 'recover': case 'roost': case 'softboiled': case 'synthesis':
					if (hasMove['leechseed'] || hasMove['rest'] || hasMove['wish']) rejected = true;
					break;
				case 'safeguard':
					if (hasMove['destinybond']) rejected = true;
					break;
				case 'substitute':
					if (hasMove['dracometeor'] || (hasMove['leafstorm'] && !hasAbility['Contrary']) || hasMove['pursuit'] || hasMove['rest'] || hasMove['taunt'] || hasMove['uturn'] || hasMove['voltswitch']) rejected = true;
					break;
				}

				// Increased/decreased priority moves are unneeded with moves that boost only speed
				if (move.priority !== 0 && (!!counter['speedsetup'] || hasMove['copycat'])) {
					rejected = true;
				}

				// Certain Pokemon should always have a recovery move
				if (!counter.recovery && template.baseStats.hp >= 165 && movePool.includes('wish')) {
					if (move.category === 'Status' || !hasType[move.type] && !move.damage) rejected = true;
				}
				if (template.nfe && !isSetup && !counter.recovery && !!counter['Status'] && (movePool.includes('recover') || movePool.includes('roost'))) {
					if (move.category === 'Status' || !hasType[move.type]) rejected = true;
				}

				// This move doesn't satisfy our setup requirements:
				if ((move.category === 'Physical' && counter.setupType === 'Special') || (move.category === 'Special' && counter.setupType === 'Physical')) {
					// Reject STABs last in case the setup type changes later on
					if (!SetupException.includes(moveid) && (!hasType[move.type] || counter.stab > 1 || counter[move.category] < 2)) rejected = true;
				}
				if (counter.setupType && !isSetup && counter.setupType !== 'Mixed' && move.category !== counter.setupType && counter[counter.setupType] < 2 && !hasMove['batonpass'] && moveid !== 'rest' && moveid !== 'sleeptalk') {
					// Mono-attacking with setup and RestTalk is allowed
					// Reject Status moves only if there is nothing else to reject
					if (move.category !== 'Status' || counter[counter.setupType] + counter.Status > 3 && counter['physicalsetup'] + counter['specialsetup'] < 2) rejected = true;
				}
				if (counter.setupType === 'Special' && moveid === 'hiddenpower' && template.types.length > 1 && counter['Special'] <= 2 && !hasType[move.type] && !counter['Physical'] && counter['specialpool']) {
					// Hidden Power isn't good enough
					rejected = true;
				}

				// Pokemon should have moves that benefit their Ability/Type/Weather, as well as moves required by its forme
				if ((hasType['Bug'] && !hasMove['batonpass'] && (movePool.includes('megahorn') || movePool.includes('pinmissile') || (hasType['Flying'] && !hasMove['hurricane'] && movePool.includes('bugbuzz')))) ||
					(hasType['Dark'] && hasMove['suckerpunch'] && counter.stab < template.types.length) ||
					(hasType['Dragon'] && !counter['Dragon'] && !hasAbility['Aerilate'] && !hasAbility['Pixilate'] && !hasMove['rest'] && !hasMove['sleeptalk']) ||
					(hasType['Electric'] && !counter['Electric']) ||
					(hasType['Fighting'] && !counter['Fighting'] && (counter.setupType || !counter['Status'])) ||
					(hasType['Fire'] && !counter['Fire']) ||
					(hasType['Ground'] && !counter['Ground'] && !hasMove['rest'] && !hasMove['sleeptalk']) ||
					(hasType['Ice'] && !counter['Ice'] && !hasAbility['Refrigerate']) ||
					(hasType['Psychic'] && !!counter['Psychic'] && !hasType['Flying'] && !hasAbility['Pixilate'] && template.types.length > 1 && counter.stab < 2) ||
					(hasType['Water'] && (!counter['Water'] || !counter.stab) && !hasAbility['Protean']) ||
					((hasAbility['Adaptability'] && !counter.setupType && template.types.length > 1 && (!counter[template.types[0]] || !counter[template.types[1]])) ||
					((hasAbility['Aerilate'] || (hasAbility['Galvanize'] && !counter['Electric']) || hasAbility['Pixilate'] || (hasAbility['Refrigerate'] && !hasMove['blizzard'])) && !counter['Normal']) ||
					(hasAbility['Contrary'] && !counter['contrary'] && template.species !== 'Shuckle') ||
					(hasAbility['Dark Aura'] && !counter['Dark']) ||
					(hasAbility['Gale Wings'] && !counter['Flying']) ||
					(hasAbility['Grassy Surge'] && !counter['Grass']) ||
					(hasAbility['Guts'] && hasType['Normal'] && movePool.includes('facade')) ||
					(hasAbility['Slow Start'] && movePool.includes('substitute')) ||
					(hasAbility['Stance Change'] && !counter.setupType && movePool.includes('kingsshield')) ||
					(hasAbility['Water Bubble'] && !counter['Water']) ||
					(counter['defensesetup'] && !counter.recovery && !hasMove['rest']) ||
					(movePool.includes('technoblast') || template.requiredMove && movePool.includes(toId(template.requiredMove)))) &&
					(counter['physicalsetup'] + counter['specialsetup'] < 2 && (!counter.setupType || counter.setupType === 'Mixed' || (move.category !== counter.setupType && move.category !== 'Status') || counter[counter.setupType] + counter.Status > 3))) {
					// Reject Status or non-STAB
					if (!isSetup && !move.weather && moveid !== 'judgment' && moveid !== 'rest' && moveid !== 'sleeptalk') {
						if (move.category === 'Status' || !hasType[move.type] || (move.basePower && move.basePower < 40 && !move.multihit)) rejected = true;
					}
				}

				// Sleep Talk shouldn't be selected without Rest
				if (moveid === 'rest' && rejected) {
					let sleeptalk = movePool.indexOf('sleeptalk');
					if (sleeptalk >= 0) {
						if (movePool.length < 2) {
							rejected = false;
						} else {
							this.fastPop(movePool, sleeptalk);
						}
					}
				}

				// Remove rejected moves from the move list
				if (rejected && (movePool.length - availableHP || availableHP && (moveid === 'hiddenpower' || !hasMove['hiddenpower']))) {
					moves.splice(k, 1);
					break;
				}
			}
			if (moves.length === 4 && !counter.stab && !hasMove['metalburst'] && (counter['physicalpool'] || counter['specialpool'])) {
				// Move post-processing:
				if (counter.damagingMoves.length === 0) {
					// A set shouldn't have no attacking moves
					moves.splice(this.random(moves.length), 1);
				} else if (counter.damagingMoves.length === 1) {
					// In most cases, a set shouldn't have no STAB
					let damagingid = counter.damagingMoves[0].id;
					if (movePool.length - availableHP || availableHP && (damagingid === 'hiddenpower' || !hasMove['hiddenpower'])) {
						let replace = false;
						if (!counter.damagingMoves[0].damage && template.species !== 'Porygon2') {
							let damagingType = counter.damagingMoves[0].type;
							if (damagingType === 'Fairy') {
								// Mono-Fairy is acceptable for Psychic types
								if (counter.setupType !== 'Special' || template.types.length > 1 || !hasType['Psychic']) replace = true;
							} else {
								replace = true;
							}
						}
						if (replace) moves.splice(counter.damagingMoveIndex[damagingid], 1);
					}
				} else if (!counter.damagingMoves[0].damage && !counter.damagingMoves[1].damage && template.species !== 'Porygon2') {
					// If you have three or more attacks, and none of them are STAB, reject one of them at random.
					let rejectableMoves = [];
					let baseDiff = movePool.length - availableHP;
					for (let l = 0; l < counter.damagingMoves.length; l++) {
						if (counter.damagingMoves[l].id === 'technoblast') continue;
						if (baseDiff || availableHP && (!hasMove['hiddenpower'] || counter.damagingMoves[l].id === 'hiddenpower')) {
							rejectableMoves.push(counter.damagingMoveIndex[counter.damagingMoves[l].id]);
						}
					}
					if (rejectableMoves.length) {
						moves.splice(rejectableMoves[this.random(rejectableMoves.length)], 1);
					}
				}
			}
		} while (moves.length < 4 && movePool.length);

		// Moveset modifications
		if (hasMove['autotomize'] && hasMove['heavyslam']) {
			if (template.id === 'celesteela') {
				moves[moves.indexOf('heavyslam')] = 'flashcannon';
			} else {
				moves[moves.indexOf('autotomize')] = 'rockpolish';
			}
		}
		if (moves[0] === 'conversion') {
			moves[0] = moves[3];
			moves[3] = 'conversion';
		}

		let abilities = Object.values(baseTemplate.abilities);
		abilities.sort((a, b) => this.getAbility(b).rating - this.getAbility(a).rating);
		let ability0 = this.getAbility(abilities[0]);
		let ability1 = this.getAbility(abilities[1]);
		let ability2 = this.getAbility(abilities[2]);
		if (abilities[1]) {
			if (abilities[2] && ability1.rating <= ability2.rating && this.random(2)) {
				[ability1, ability2] = [ability2, ability1];
			}
			if (ability0.rating <= ability1.rating && this.random(2)) {
				[ability0, ability1] = [ability1, ability0];
			} else if (ability0.rating - 0.6 <= ability1.rating && this.random(3)) {
				[ability0, ability1] = [ability1, ability0];
			}
			ability = ability0.name;

			let rejectAbility;
			do {
				rejectAbility = false;
				if (counterAbilities.includes(ability)) {
					// Adaptability, Contrary, Hustle, Iron Fist, Skill Link
					rejectAbility = !counter[toId(ability)];
				} else if (ateAbilities.includes(ability)) {
					rejectAbility = !counter['Normal'];
				} else if (ability === 'Blaze') {
					rejectAbility = !counter['Fire'];
				} else if (ability === 'Chlorophyll') {
					rejectAbility = !hasMove['sunnyday'] && !teamDetails['sun'];
				} else if (ability === 'Competitive') {
					rejectAbility = (!counter['Special'] && !hasMove['batonpass']) || (hasMove['rest'] && hasMove['sleeptalk']);
				} else if (ability === 'Compound Eyes' || ability === 'No Guard') {
					rejectAbility = !counter['inaccurate'];
				} else if (ability === 'Defiant' || ability === 'Moxie') {
					rejectAbility = !counter['Physical'] && !hasMove['batonpass'];
				} else if (ability === 'Flare Boost' || ability === 'Moody') {
					rejectAbility = true;
				} else if (ability === 'Gluttony') {
					rejectAbility = !hasMove['bellydrum'];
				} else if (ability === 'Hydration' || ability === 'Rain Dish' || ability === 'Swift Swim') {
					rejectAbility = !hasMove['raindance'] && !teamDetails['rain'];
				} else if (ability === 'Ice Body' || ability === 'Slush Rush' || ability === 'Snow Cloak') {
					rejectAbility = !teamDetails['hail'];
				} else if (ability === 'Lightning Rod') {
					rejectAbility = template.types.includes('Ground');
				} else if (ability === 'Limber') {
					rejectAbility = template.types.includes('Electric');
				} else if (ability === 'Liquid Voice') {
					rejectAbility = !hasMove['hypervoice'];
				} else if (ability === 'Overgrow') {
					rejectAbility = !counter['Grass'];
				} else if (ability === 'Poison Heal') {
					rejectAbility = abilities.includes('Technician') && !!counter['technician'];
				} else if (ability === 'Power Construct') {
					rejectAbility = template.forme === '10%' && !hasMove['substitute'];
				} else if (ability === 'Prankster' || ability === 'Pressure') {
					rejectAbility = !counter['Status'];
				} else if (ability === 'Regenerator') {
					rejectAbility = abilities.includes('Magic Guard');
				} else if (ability === 'Quick Feet') {
					rejectAbility = hasMove['bellydrum'];
				} else if (ability === 'Reckless' || ability === 'Rock Head') {
					rejectAbility = !counter['recoil'];
				} else if (ability === 'Sand Force' || ability === 'Sand Rush' || ability === 'Sand Veil') {
					rejectAbility = !teamDetails['sand'];
				} else if (ability === 'Scrappy') {
					rejectAbility = !template.types.includes('Normal');
				} else if (ability === 'Serene Grace') {
					rejectAbility = !counter['serenegrace'] || template.species === 'Blissey' || template.species === 'Togetic';
				} else if (ability === 'Sheer Force') {
					rejectAbility = !counter['sheerforce'] || template.isMega || (abilities.includes('Iron Fist') && counter['ironfist'] > counter['sheerforce']);
				} else if (ability === 'Simple') {
					rejectAbility = !counter.setupType && !hasMove['cosmicpower'] && !hasMove['flamecharge'];
				} else if (ability === 'Snow Warning') {
					rejectAbility = hasMove['hypervoice'];
				} else if (ability === 'Solar Power') {
					rejectAbility = !counter['Special'] || template.isMega;
				} else if (ability === 'Strong Jaw') {
					rejectAbility = !counter['bite'];
				} else if (ability === 'Sturdy') {
					rejectAbility = !!counter['recoil'] && !counter['recovery'];
				} else if (ability === 'Swarm') {
					rejectAbility = !counter['Bug'];
				} else if (ability === 'Synchronize') {
					rejectAbility = counter.Status < 2;
				} else if (ability === 'Technician') {
					rejectAbility = !counter['technician'] || (abilities.includes('Skill Link') && counter['skilllink'] >= counter['technician']);
				} else if (ability === 'Tinted Lens') {
					rejectAbility = counter['damage'] >= counter.damagingMoves.length || (counter.Status > 2 && !counter.setupType);
				} else if (ability === 'Torrent') {
					rejectAbility = !counter['Water'];
				} else if (ability === 'Triage') {
					rejectAbility = !counter['recovery'] && !counter['drain'];
				} else if (ability === 'Unburden') {
					rejectAbility = template.isMega || (!counter.setupType && !hasMove['acrobatics']);
				} else if (ability === 'Water Absorb') {
					rejectAbility = abilities.includes('Volt Absorb') || (abilities.includes('Water Bubble') && !!counter['Water']);
				}

				if (rejectAbility) {
					if (ability === ability0.name && ability1.rating > 1) {
						ability = ability1.name;
					} else if (ability === ability1.name && abilities[2] && ability2.rating > 1) {
						ability = ability2.name;
					} else {
						// Default to the highest rated ability if all are rejected
						ability = abilities[0];
						rejectAbility = false;
					}
				}
			} while (rejectAbility);

			if (abilities.includes('Galvanize') && !!counter['Normal']) {
				ability = 'Galvanize';
			}
			if (abilities.includes('Guts') && ability !== 'Quick Feet' && (hasMove['facade'] || hasMove['protect'] || (hasMove['rest'] && hasMove['sleeptalk']))) {
				ability = 'Guts';
			}
			if (abilities.includes('Prankster') && counter.Status > 1) {
				ability = 'Prankster';
			}
			if (abilities.includes('Swift Swim') && hasMove['raindance']) {
				ability = 'Swift Swim';
			}
			if (abilities.includes('Triage') && !!counter['drain']) {
				ability = 'Triage';
			}
			if (abilities.includes('Unburden') && hasMove['acrobatics']) {
				ability = 'Unburden';
			}
			if (template.species === 'Ambipom' && !counter['technician']) {
				// If it doesn't qualify for Technician, Skill Link is useless on it
				ability = 'Pickup';
			} else if (template.baseSpecies === 'Basculin') {
				ability = 'Adaptability';
			} else if (template.species === 'Lopunny' && hasMove['switcheroo'] && this.random(3)) {
				ability = 'Klutz';
			} else if ((template.species === 'Rampardos' && !hasMove['headsmash']) || hasMove['rockclimb']) {
				ability = 'Sheer Force';
			} else if (template.species === 'Umbreon') {
				ability = 'Synchronize';
			} else if (template.id === 'venusaurmega') {
				ability = 'Chlorophyll';
			}
		} else {
			ability = ability0.name;
		}

		item = 'Leftovers';
		if (template.requiredItems) {
			if (template.baseSpecies === 'Arceus' && hasMove['judgment']) {
				// Judgment doesn't change type with Z-Crystals
				item = template.requiredItems[0];
			} else {
				item = template.requiredItems[this.random(template.requiredItems.length)];
			}
		} else if (hasMove['magikarpsrevenge']) {
			// PoTD Magikarp
			item = 'Choice Band';
		} else if (template.species === 'Rotom-Fan') {
			// This is just to amuse Zarel
			item = 'Air Balloon';

		// First, the extra high-priority items
		} else if (template.species === 'Clamperl' && !hasMove['shellsmash']) {
			item = 'Deep Sea Tooth';
		} else if (template.species === 'Cubone' || template.baseSpecies === 'Marowak') {
			item = 'Thick Club';
		} else if (template.species === 'Dedenne') {
			item = 'Petaya Berry';
		} else if (template.species === 'Deoxys-Attack') {
			item = (slot === 0 && hasMove['stealthrock']) ? 'Focus Sash' : 'Life Orb';
		} else if (template.species === 'Farfetch\'d') {
			item = 'Stick';
		} else if (template.species === 'Kommo-o' && !teamDetails.zMove) {
			item = hasMove['clangingscales'] ? 'Kommonium Z' : 'Dragonium Z';
		} else if (template.baseSpecies === 'Pikachu') {
			item = 'Light Ball';
		} else if (template.species === 'Shedinja' || template.species === 'Smeargle') {
			item = 'Focus Sash';
		} else if (template.species === 'Unfezant' && counter['Physical'] >= 2) {
			item = 'Scope Lens';
		} else if (template.species === 'Unown') {
			item = 'Choice Specs';
		} else if (template.species === 'Wobbuffet') {
			item = hasMove['destinybond'] ? 'Custap Berry' : ['Leftovers', 'Sitrus Berry'][this.random(2)];
		} else if (template.species === 'Raichu-Alola' && hasMove['thunderbolt'] && !teamDetails.zMove && this.random(4) < 1) {
			item = 'Aloraichium Z';
		} else if (template.species === 'Zygarde-10%' && hasMove['substitute'] && !teamDetails.zMove) {
			item = hasMove['outrage'] ? 'Dragonium Z' : 'Groundium Z';
		} else if (ability === 'Imposter') {
			item = 'Choice Scarf';
		} else if (hasMove['geomancy']) {
			item = 'Power Herb';
		} else if (ability === 'Klutz' && hasMove['switcheroo']) {
			// To perma-taunt a Pokemon by giving it Assault Vest
			item = 'Assault Vest';
		} else if (hasMove['switcheroo'] || hasMove['trick']) {
			let randomNum = this.random(3);
			if (counter.Physical >= 3 && (template.baseStats.spe < 60 || template.baseStats.spe > 108 || randomNum)) {
				item = 'Choice Band';
			} else if (counter.Special >= 3 && (template.baseStats.spe < 60 || template.baseStats.spe > 108 || randomNum)) {
				item = 'Choice Specs';
			} else {
				item = 'Choice Scarf';
			}
		} else if (hasMove['conversion']) {
			item = 'Normalium Z';
		} else if (hasMove['mindblown'] && !!counter['Status'] && !teamDetails.zMove) {
			item = 'Firium Z';
		} else if (!teamDetails.zMove && (hasMove['fly'] || hasMove['bounce'] && counter.setupType)) {
			item = 'Flyinium Z';
		} else if (hasMove['solarbeam'] && !hasAbility['Drought'] && !hasMove['sunnyday'] && !teamDetails['sun']) {
			item = !teamDetails.zMove ? 'Grassium Z' : 'Power Herb';
		} else if (template.evos.length) {
			item = (ability === 'Technician' && counter.Physical >= 4) ? 'Choice Band' : 'Eviolite';
		} else if (template.species === 'Latias' || template.species === 'Latios') {
			item = 'Soul Dew';
		} else if (hasMove['bellydrum']) {
			if (ability === 'Gluttony') {
				item = ['Aguav', 'Figy', 'Iapapa', 'Mago', 'Wiki'][this.random(5)] + ' Berry';
			} else if (template.baseStats.spe <= 50 && !teamDetails.zMove && this.random(2)) {
				item = 'Normalium Z';
			} else {
				item = 'Sitrus Berry';
			}
		} else if (hasMove['shellsmash']) {
			item = (ability === 'Solid Rock' && counter['priority']) ? 'Weakness Policy' : 'White Herb';
		} else if (ability === 'Harvest') {
			item = hasMove['rest'] ? 'Lum Berry' : 'Sitrus Berry';
		} else if (ability === 'Magic Guard' || ability === 'Sheer Force') {
			item = hasMove['psychoshift'] ? 'Flame Orb' : 'Life Orb';
		} else if (ability === 'Poison Heal' || ability === 'Toxic Boost') {
			item = 'Toxic Orb';
		} else if (hasMove['rest'] && !hasMove['sleeptalk'] && ability !== 'Natural Cure' && ability !== 'Shed Skin') {
			item = (hasMove['raindance'] && ability === 'Hydration') ? 'Damp Rock' : 'Chesto Berry';
		} else if (hasMove['raindance']) {
			item = (ability === 'Swift Swim' && counter.Status < 2) ? 'Life Orb' : 'Damp Rock';
		} else if (hasMove['sunnyday']) {
			item = (ability === 'Chlorophyll' && counter.Status < 2) ? 'Life Orb' : 'Heat Rock';
		} else if (hasMove['auroraveil'] || hasMove['lightscreen'] && hasMove['reflect']) {
			item = 'Light Clay';
		} else if ((ability === 'Guts' || hasMove['facade']) && !hasMove['sleeptalk']) {
			item = (hasType['Fire'] || ability === 'Quick Feet') ? 'Toxic Orb' : 'Flame Orb';
		} else if (ability === 'Unburden') {
			if (hasMove['fakeout']) {
				item = 'Normal Gem';
			} else {
				item = 'Sitrus Berry';
			}
		} else if (hasMove['acrobatics']) {
			item = '';

		// Medium priority
		} else if (((ability === 'Speed Boost' && !hasMove['substitute']) || (ability === 'Stance Change')) && counter.Physical + counter.Special > 2) {
			item = 'Life Orb';
		} else if (template.baseStats.spe <= 50 && hasMove['sleeppowder'] && counter.setupType && !teamDetails.zMove) {
			item = 'Grassium Z';
		} else if (counter.Physical >= 4 && !hasMove['bodyslam'] && !hasMove['dragontail'] && !hasMove['fakeout'] && !hasMove['flamecharge'] && !hasMove['rapidspin'] && !hasMove['suckerpunch']) {
			item = template.baseStats.atk >= 100 && template.baseStats.spe >= 60 && template.baseStats.spe <= 108 && !counter['priority'] && this.random(3) ? 'Choice Scarf' : 'Choice Band';
		} else if (counter.Special >= 4 && !hasMove['acidspray'] && !hasMove['chargebeam'] && !hasMove['clearsmog'] && !hasMove['fierydance']) {
			item = template.baseStats.spa >= 100 && template.baseStats.spe >= 60 && template.baseStats.spe <= 108 && !counter['priority'] && this.random(3) ? 'Choice Scarf' : 'Choice Specs';
		} else if (((counter.Physical >= 3 && hasMove['defog']) || (counter.Special >= 3 && hasMove['uturn'])) && template.baseStats.spe >= 60 && template.baseStats.spe <= 108 && !counter['priority'] && this.random(3)) {
			item = 'Choice Scarf';
		} else if (ability === 'Defeatist' || hasMove['eruption'] || hasMove['waterspout']) {
			item = counter.Status <= 1 ? 'Expert Belt' : 'Leftovers';
		} else if (hasMove['reversal'] && hasMove['substitute'] && !teamDetails.zMove) {
			item = 'Fightinium Z';
		} else if ((hasMove['endeavor'] || hasMove['flail'] || hasMove['reversal']) && ability !== 'Sturdy') {
			item = 'Focus Sash';
		} else if (this.getEffectiveness('Ground', template) >= 2 && ability !== 'Levitate' && !hasMove['magnetrise']) {
			item = 'Air Balloon';
		} else if (hasMove['outrage'] && (counter.setupType || ability === 'Multiscale')) {
			item = 'Lum Berry';
		} else if (ability === 'Slow Start' || hasMove['clearsmog'] || hasMove['curse'] || hasMove['detect'] || hasMove['protect'] || hasMove['sleeptalk']) {
			item = 'Leftovers';
		} else if (hasMove['substitute']) {
			item = !counter['drain'] || counter.damagingMoves.length < 2 ? 'Leftovers' : 'Life Orb';
		} else if ((ability === 'Iron Barbs' || ability === 'Rough Skin') && this.random(2)) {
			item = 'Rocky Helmet';
		} else if (counter.Physical + counter.Special >= 4 && template.baseStats.spd >= 65 && template.baseStats.hp + template.baseStats.def + template.baseStats.spd >= 235) {
			item = 'Assault Vest';
		} else if (counter.damagingMoves.length >= 4) {
			item = (!!counter['Normal'] || (hasMove['suckerpunch'] && !hasType['Dark'])) ? 'Life Orb' : 'Expert Belt';
		} else if (counter.damagingMoves.length >= 3 && !!counter['speedsetup'] && template.baseStats.hp + template.baseStats.def + template.baseStats.spd >= 300) {
			item = 'Weakness Policy';
		} else if (counter.damagingMoves.length >= 3 && ability !== 'Sturdy' && !hasMove['clearsmog'] && !hasMove['dragontail'] && !hasMove['foulplay'] && !hasMove['superfang']) {
			item = (template.baseStats.hp + template.baseStats.def + template.baseStats.spd < 285 || !!counter['speedsetup'] || hasMove['trickroom']) ? 'Life Orb' : 'Leftovers';
		} else if (template.species === 'Palkia' && (hasMove['dracometeor'] || hasMove['spacialrend']) && hasMove['hydropump']) {
			item = 'Lustrous Orb';
		} else if (slot === 0 && ability !== 'Regenerator' && ability !== 'Sturdy' && !counter['recoil'] && !counter['recovery'] && template.baseStats.hp + template.baseStats.def + template.baseStats.spd < 285) {
			item = 'Focus Sash';

		// This is the "REALLY can't think of a good item" cutoff
		} else if (ability === 'Super Luck') {
			item = 'Scope Lens';
		} else if (ability === 'Sturdy' && hasMove['explosion'] && !counter['speedsetup']) {
			item = 'Custap Berry';
		} else if (hasType['Poison']) {
			item = 'Black Sludge';
		} else if (ability === 'Gale Wings' && hasMove['bravebird']) {
			item = !teamDetails.zMove ? 'Flyinium Z' : 'Sharp Beak';
		} else if (this.getEffectiveness('Rock', template) >= 1 || hasMove['dragontail']) {
			item = 'Leftovers';
		} else if (this.getImmunity('Ground', template) && this.getEffectiveness('Ground', template) >= 1 && ability !== 'Levitate' && ability !== 'Solid Rock' && !hasMove['magnetrise'] && !hasMove['sleeptalk']) {
			item = 'Air Balloon';
		} else if (counter.Status <= 1 && ability !== 'Sturdy' && !hasMove['rapidspin']) {
			item = 'Life Orb';
		} else {
			item = 'Leftovers';
		}

		// For Trick / Switcheroo
		if (item === 'Leftovers' && hasType['Poison']) {
			item = 'Black Sludge';
		}

		let levelScale = {
			LC: 87,
			'LC Uber': 86,
			NFE: 84,
			PU: 83,
			BL4: 82,
			NU: 81,
			BL3: 80,
			RU: 79,
			BL2: 78,
			UU: 77,
			BL: 76,
			OU: 75,
			Uber: 73,
			AG: 71,
		};
		let customScale = {
			// Banned Abilities
			Dugtrio: 77, Gothitelle: 77, Politoed: 79, Wobbuffet: 77,

			// Holistic judgement
			Unown: 100,
		};
		let tier = template.tier;
		if (tier.includes('Unreleased') && baseTemplate.tier === 'Uber') {
			tier = 'Uber';
		}
		if (tier.charAt(0) === '(') {
			tier = tier.slice(1, -1);
		}
		let level = levelScale[tier] || 75;
		if (customScale[template.name]) level = customScale[template.name];

		// Custom level based on moveset
		if (ability === 'Power Construct') level = 73;
		if (item === 'Kommonium Z') level = 77;
		if (hasMove['batonpass'] && counter.setupType && level > 77) level = 77;

		// Prepare optimal HP
		let hp = Math.floor(Math.floor(2 * template.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
		if (hasMove['substitute'] && (item === 'Sitrus Berry' || (ability === 'Power Construct' && item !== 'Leftovers'))) {
			// Two Substitutes should activate Sitrus Berry or Power Construct
			while (hp % 4 > 0) {
				evs.hp -= 4;
				hp = Math.floor(Math.floor(2 * template.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
			}
		} else if (hasMove['bellydrum'] && (item === 'Sitrus Berry' || ability === 'Gluttony')) {
			// Belly Drum should activate Sitrus Berry
			if (hp % 2 > 0) evs.hp -= 4;
		} else if (hasMove['substitute'] && hasMove['reversal']) {
			// Reversal users should be able to use four Substitutes
			if (hp % 4 === 0) evs.hp -= 4;
		} else {
			// Maximize number of Stealth Rock switch-ins
			let srWeakness = this.getEffectiveness('Rock', template);
			if (srWeakness > 0 && hp % (4 / srWeakness) === 0) evs.hp -= 4;
		}

		// Minimize confusion damage
		if (!counter['Physical'] && !hasMove['copycat'] && !hasMove['transform']) {
			evs.atk = 0;
			ivs.atk = 0;
		}

		if (hasMove['gyroball'] || hasMove['trickroom']) {
			evs.spe = 0;
			ivs.spe = 0;
		}

		return {
			name: template.baseSpecies,
			species: species,
			moves: moves,
			ability: ability,
			evs: evs,
			ivs: ivs,
			item: item,
			level: level,
			shiny: !this.random(1024),
		};
	}
	randomTeam() {
		let pokemon = [];

		let excludedTiers = ['NFE', 'LC Uber', 'LC'];
		let allowedNFE = ['Chansey', 'Doublade', 'Gligar', 'Porygon2', 'Scyther', 'Togetic'];

		// For Monotype
		let isMonotype = this.format.id === 'gen7monotyperandombattle';
		let typePool = Object.keys(this.data.TypeChart);
		let type = typePool[this.random(typePool.length)];

		let pokemonPool = [];
		for (let id in this.data.FormatsData) {
			let template = this.getTemplate(id);
			if (isMonotype) {
				let types = template.types;
				if (template.battleOnly) types = this.getTemplate(template.baseSpecies).types;
				if (types.indexOf(type) < 0) continue;
			}
			if (template.gen <= this.gen && !excludedTiers.includes(template.tier) && !template.isMega && !template.isPrimal && !template.isNonstandard && template.randomBattleMoves) {
				pokemonPool.push(id);
			}
		}

		// PotD stuff
		let potd;
		if (global.Config && Config.potd && this.getRuleTable(this.getFormat()).has('potd')) {
			potd = this.getTemplate(Config.potd);
		}

		let typeCount = {};
		let typeComboCount = {};
		let baseFormes = {};
		let uberCount = 0;
		let puCount = 0;
		let teamDetails = {};

		while (pokemonPool.length && pokemon.length < 6) {
			let template = this.getTemplate(this.sampleNoReplace(pokemonPool));
			if (!template.exists) continue;

			// Limit to one of each species (Species Clause)
			if (baseFormes[template.baseSpecies]) continue;

			// Only certain NFE Pokemon are allowed
			if (template.evos.length && !allowedNFE.includes(template.species)) continue;

			let tier = template.tier;
			switch (tier) {
			case 'Uber':
				// Ubers are limited to 2 but have a 20% chance of being added anyway.
				if (uberCount > 1 && this.random(5) >= 1) continue;
				break;
			case 'PU':
				// PUs are limited to 2 but have a 20% chance of being added anyway.
				if (puCount > 1 && this.random(5) >= 1) continue;
				break;
			case 'Unreleased': case 'CAP':
				// Unreleased and CAP have 20% the normal rate
				if (this.random(5) >= 1) continue;
			}

			// Adjust rate for species with multiple formes
			switch (template.baseSpecies) {
			case 'Arceus': case 'Silvally':
				if (this.random(18) >= 1) continue;
				break;
			case 'Pikachu':
				if (this.random(7) >= 1) continue;
				continue;
			case 'Genesect':
				if (this.random(5) >= 1) continue;
				break;
			case 'Castform': case 'Gourgeist': case 'Oricorio':
				if (this.random(4) >= 1) continue;
				break;
			case 'Basculin': case 'Cherrim': case 'Greninja': case 'Hoopa': case 'Meloetta': case 'Meowstic':
				if (this.random(2) >= 1) continue;
				break;
			}

			if (potd && potd.exists) {
				// The Pokemon of the Day belongs in slot 2
				if (pokemon.length === 1) {
					template = potd;
					if (template.species === 'Magikarp') {
						template.randomBattleMoves = ['bounce', 'flail', 'splash', 'magikarpsrevenge'];
					} else if (template.species === 'Delibird') {
						template.randomBattleMoves = ['present', 'bestow'];
					}
				} else if (template.species === potd.species) {
					continue; // No thanks, I've already got one
				}
			}

			let types = template.types;

			if (!isMonotype) {
				// Limit 2 of any type
				let skip = false;
				for (let t = 0; t < types.length; t++) {
					if (typeCount[types[t]] > 1 && this.random(5) >= 1) {
						skip = true;
						break;
					}
				}
				if (skip) continue;
			}

			let set = this[this.format.gameType === 'singles' ? 'randomSet' : 'randomDoublesSet'](template, pokemon.length, teamDetails);

			// Illusion shouldn't be the last Pokemon of the team
			if (set.ability === 'Illusion' && pokemon.length > 4) continue;

			// Pokemon shouldn't have Physical and Special setup on the same set
			let incompatibleMoves = ['bellydrum', 'swordsdance', 'calmmind', 'nastyplot'];
			let intersectMoves = set.moves.filter(move => incompatibleMoves.includes(move));
			if (intersectMoves.length > 1) continue;

			// Limit 1 of any type combination, 2 in monotype
			let typeCombo = types.slice().sort().join();
			if (set.ability === 'Drought' || set.ability === 'Drizzle' || set.ability === 'Sand Stream') {
				// Drought, Drizzle and Sand Stream don't count towards the type combo limit
				typeCombo = set.ability;
				if (typeCombo in typeComboCount) continue;
			} else {
				if (typeComboCount[typeCombo] >= (isMonotype ? 2 : 1)) continue;
			}

			// Okay, the set passes, add it to our team
			pokemon.push(set);

			// Now that our Pokemon has passed all checks, we can increment our counters
			baseFormes[template.baseSpecies] = 1;

			// Increment type counters
			for (let t = 0; t < types.length; t++) {
				if (types[t] in typeCount) {
					typeCount[types[t]]++;
				} else {
					typeCount[types[t]] = 1;
				}
			}
			if (typeCombo in typeComboCount) {
				typeComboCount[typeCombo]++;
			} else {
				typeComboCount[typeCombo] = 1;
			}

			// Increment Uber/PU counters
			if (tier === 'Uber') {
				uberCount++;
			} else if (tier === 'PU') {
				puCount++;
			}

			// Team has Mega/weather/hazards
			let item = this.getItem(set.item);
			if (item.megaStone) teamDetails['megaStone'] = 1;
			if (item.zMove) teamDetails['zMove'] = 1;
			if (set.ability === 'Snow Warning') teamDetails['hail'] = 1;
			if (set.moves.includes('raindance') || set.ability === 'Drizzle' && !item.onPrimal) teamDetails['rain'] = 1;
			if (set.ability === 'Sand Stream') teamDetails['sand'] = 1;
			if (set.moves.includes('sunnyday') || set.ability === 'Drought' && !item.onPrimal) teamDetails['sun'] = 1;
			if (set.moves.includes('stealthrock')) teamDetails['stealthRock'] = 1;
			if (set.moves.includes('toxicspikes')) teamDetails['toxicSpikes'] = 1;
			if (set.moves.includes('defog') || set.moves.includes('rapidspin')) teamDetails['hazardClear'] = 1;
		}
		return pokemon;
	}
	randomDoublesSet(template, slot, teamDetails) {
		let baseTemplate = (template = this.getTemplate(template));
		let species = template.species;

		if (!template.exists || (!template.randomDoubleBattleMoves && !template.randomBattleMoves && !template.learnset)) {
			template = this.getTemplate('unown');

			let err = new Error('Template incompatible with random battles: ' + species);
			require('../lib/crashlogger')(err, 'The doubles randbat set generator');
		}

		if (typeof teamDetails !== 'object') teamDetails = {megaStone: teamDetails};

		if (template.battleOnly) {
			// Only change the species. The template has custom moves, and may have different typing and requirements.
			species = template.baseSpecies;
		}
		let battleForme = this.checkBattleForme(template);
		if (battleForme && (battleForme.isMega ? !teamDetails.megaStone : this.random(2))) {
			template = this.getTemplate(template.otherFormes.length >= 2 ? template.otherFormes[this.random(template.otherFormes.length)] : template.otherFormes[0]);
		}

		let movePool = (template.randomDoubleBattleMoves || template.randomBattleMoves);
		movePool = movePool ? movePool.slice() : Object.keys(template.learnset);

		let moves = [];
		let ability = '';
		let item = '';
		let evs = {
			hp: 85,
			atk: 85,
			def: 85,
			spa: 85,
			spd: 85,
			spe: 85,
		};
		let ivs = {
			hp: 31,
			atk: 31,
			def: 31,
			spa: 31,
			spd: 31,
			spe: 31,
		};
		let hasType = {};
		hasType[template.types[0]] = true;
		if (template.types[1]) {
			hasType[template.types[1]] = true;
		}
		let hasAbility = {};
		hasAbility[template.abilities[0]] = true;
		if (template.abilities[1]) {
			hasAbility[template.abilities[1]] = true;
		}
		if (template.abilities['H']) {
			hasAbility[template.abilities['H']] = true;
		}
		let availableHP = 0;
		for (let i = 0, len = movePool.length; i < len; i++) {
			if (movePool[i].substr(0, 11) === 'hiddenpower') availableHP++;
		}

		// These moves can be used even if we aren't setting up to use them:
		let SetupException = [
			'dracometeor', 'leafstorm', 'overheat',
			'extremespeed', 'suckerpunch', 'superpower',
		];
		let counterAbilities = [
			'Adaptability', 'Contrary', 'Hustle', 'Iron Fist', 'Skill Link',
		];
		// -ate Abilities
		let ateAbilities = [
			'Aerilate', 'Pixilate', 'Refrigerate',
		];

		let hasMove, counter;

		do {
			// Keep track of all moves we have:
			hasMove = {};
			for (let k = 0; k < moves.length; k++) {
				if (moves[k].substr(0, 11) === 'hiddenpower') {
					hasMove['hiddenpower'] = true;
				} else {
					hasMove[moves[k]] = true;
				}
			}

			// Choose next 4 moves from learnset/viable moves and add them to moves list:
			while (moves.length < 4 && movePool.length) {
				let moveid = toId(this.sampleNoReplace(movePool));
				if (moveid.substr(0, 11) === 'hiddenpower') {
					availableHP--;
					if (hasMove['hiddenpower']) continue;
					hasMove['hiddenpower'] = true;
				} else {
					hasMove[moveid] = true;
				}
				moves.push(moveid);
			}

			counter = this.queryMoves(moves, hasType, hasAbility);

			// Iterate through the moves again, this time to cull them:
			for (let k = 0; k < moves.length; k++) {
				let move = this.getMove(moves[k]);
				let moveid = move.id;
				let rejected = false;
				let isSetup = false;

				switch (moveid) {
				// not very useful without their supporting moves
				case 'sleeptalk':
					if (!hasMove['rest']) rejected = true;
					break;
				case 'endure':
					if (!hasMove['flail'] && !hasMove['endeavor'] && !hasMove['reversal']) rejected = true;
					break;
				case 'focuspunch':
					if (hasMove['sleeptalk'] || !hasMove['substitute']) rejected = true;
					break;
				case 'storedpower':
					if (!hasMove['cosmicpower'] && !counter.setupType) rejected = true;
					break;
				case 'batonpass':
					if (!counter.setupType && !hasMove['substitute'] && !hasMove['cosmicpower'] && !counter['speedsetup'] && !hasAbility['Speed Boost']) rejected = true;
					break;

				// we only need to set up once
				case 'swordsdance': case 'dragondance': case 'coil': case 'curse': case 'bulkup': case 'bellydrum':
					if (counter.Physical < 2 && !hasMove['batonpass']) rejected = true;
					if (counter.setupType !== 'Physical' || counter['physicalsetup'] > 1) rejected = true;
					isSetup = true;
					break;
				case 'nastyplot': case 'tailglow': case 'quiverdance': case 'calmmind': case 'geomancy':
					if (counter.Special < 2 && !hasMove['batonpass']) rejected = true;
					if (counter.setupType !== 'Special' || counter['specialsetup'] > 1) rejected = true;
					isSetup = true;
					break;
				case 'shellsmash': case 'growth': case 'workup':
					if (counter.Physical + counter.Special < 2 && !hasMove['batonpass']) rejected = true;
					if (counter.setupType !== 'Mixed' || counter['mixedsetup'] > 1) rejected = true;
					isSetup = true;
					break;

				// bad after setup
				case 'nightshade': case 'seismictoss': case 'superfang':
					if (counter.setupType) rejected = true;
					break;
				case 'uturn': case 'voltswitch':
					if (counter.setupType || hasMove['agility'] || hasMove['rockpolish'] || hasMove['magnetrise']) rejected = true;
					break;
				case 'perishsong':
					if (hasMove['roar'] || hasMove['whirlwind'] || hasMove['haze']) rejected = true;
					if (counter.setupType || hasMove['agility'] || hasMove['rockpolish'] || hasMove['magnetrise']) rejected = true;
					break;
				case 'haze': case 'magiccoat': case 'protect': case 'pursuit': case 'rapidspin': case 'spikes': case 'stealthrock': case 'toxicspikes':
					if (counter.setupType || (hasMove['rest'] && hasMove['sleeptalk'])) rejected = true;
					break;
				case 'trick': case 'switcheroo':
					if (counter.setupType || counter.Physical + counter.Special < 2) rejected = true;
					if ((hasMove['rest'] && hasMove['sleeptalk']) || hasMove['trickroom'] || hasMove['reflect'] || hasMove['lightscreen'] || hasMove['acrobatics']) rejected = true;
					break;
				case 'circlethrow': case 'dragontail':
					if (hasMove['agility'] || hasMove['rockpolish']) rejected = true;
					if (hasMove['encore'] || hasMove['roar'] || hasMove['whirlwind']) rejected = true;
					break;

				// bit redundant to have both
				// Attacks:
				case 'flamethrower': case 'fierydance':
					if (hasMove['heatwave'] || hasMove['overheat'] || hasMove['fireblast'] || hasMove['blueflare']) rejected = true;
					break;
				case 'overheat':
					if (counter.setupType === 'Special' || hasMove['fireblast']) rejected = true;
					break;
				case 'icebeam':
					if (hasMove['blizzard'] || hasMove['freezedry']) rejected = true;
					break;
				case 'iceshard':
					if (hasMove['freezedry']) rejected = true;
					break;
				case 'aquatail': case 'hydropump':
					if (hasMove['muddywater'] || hasMove['razorshell'] || hasMove['scald'] || hasMove['waterfall']) rejected = true;
					break;
				case 'surf':
					if (hasMove['hydropump'] || hasMove['muddywater'] || hasMove['scald']) rejected = true;
					break;
				case 'airslash':
					if (hasMove['hurricane']) rejected = true;
					break;
				case 'acrobatics': case 'pluck': case 'drillpeck':
					if (hasMove['bravebird']) rejected = true;
					break;
				case 'lunge':
					if (hasMove['leechlife']) rejected = true;
					break;
				case 'solarbeam':
					if ((!hasMove['sunnyday'] && !hasAbility['Drought']) || hasMove['gigadrain'] || hasMove['leafstorm']) rejected = true;
					break;
				case 'gigadrain':
					if ((!counter.setupType && hasMove['leafstorm']) || hasMove['petaldance']) rejected = true;
					break;
				case 'leafstorm':
					if (counter.setupType && hasMove['gigadrain']) rejected = true;
					break;
				case 'seedbomb': case 'woodhammer':
					if (hasMove['gigadrain']) rejected = true;
					break;
				case 'weatherball':
					if (!hasMove['sunnyday']) rejected = true;
					break;
				case 'firepunch':
					if (hasMove['flareblitz'] || hasMove['fireblast']) rejected = true;
					break;
				case 'crosschop': case 'highjumpkick':
					if (hasMove['closecombat']) rejected = true;
					break;
				case 'drainpunch':
					if (hasMove['closecombat'] || hasMove['crosschop']) rejected = true;
					break;
				case 'machpunch':
					if (hasType['Fighting'] && counter.stab < 2 && !hasAbility['Technician']) rejected = true;
					break;
				case 'thunder':
					if (hasMove['thunderbolt']) rejected = true;
					break;
				case 'thunderbolt': case 'electroweb':
					if (hasMove['discharge']) rejected = true;
					break;
				case 'stoneedge':
					if (hasMove['rockslide'] || hasMove['headsmash'] || hasMove['rockblast']) rejected = true;
					break;
				case 'headsmash':
					if (hasMove['rockslide']) rejected = true;
					break;
				case 'bonemerang': case 'earthpower':
					if (hasMove['earthquake']) rejected = true;
					break;
				case 'outrage':
					if (hasMove['dragonclaw'] || hasMove['dragontail']) rejected = true;
					break;
				case 'ancientpower':
					if (hasMove['paleowave']) rejected = true;
					break;
				case 'dragonpulse':
					if (hasMove['dracometeor']) rejected = true;
					break;
				case 'moonblast':
					if (hasMove['dazzlinggleam']) rejected = true;
					break;
				case 'acidspray':
					if (hasMove['sludgebomb']) rejected = true;
					break;
				case 'return':
					if (hasMove['bodyslam'] || hasMove['facade'] || hasMove['doubleedge'] || hasMove['tailslap'] || hasMove['doublehit']) rejected = true;
					break;
				case 'poisonjab':
					if (hasMove['gunkshot']) rejected = true;
					break;
				case 'psychic':
					if (hasMove['psyshock'] || hasMove['hyperspacehole']) rejected = true;
					break;
				case 'fusionbolt':
					if (counter.setupType && hasMove['boltstrike']) rejected = true;
					break;
				case 'boltstrike':
					if (!counter.setupType && hasMove['fusionbolt']) rejected = true;
					break;
				case 'darkpulse':
					if (hasMove['crunch'] && counter.setupType !== 'Special') rejected = true;
					break;
				case 'quickattack':
					if (hasMove['feint']) rejected = true;
					break;
				case 'bulletpunch':
					if (hasType['Steel'] && counter.stab < 2 && !hasAbility['Technician']) rejected = true;
					break;
				case 'flashcannon':
					if (hasMove['ironhead']) rejected = true;
					break;
				case 'wideguard':
					if (hasMove['protect']) rejected = true;
					break;
				case 'powersplit':
					if (hasMove['guardsplit']) rejected = true;
					break;

				// Status:
				case 'rest':
					if (hasMove['painsplit'] || hasMove['wish'] || hasMove['recover'] || hasMove['moonlight'] || hasMove['synthesis']) rejected = true;
					break;
				case 'softboiled': case 'roost':
					if (hasMove['wish'] || hasMove['recover']) rejected = true;
					break;
				case 'roar':
					// Whirlwind outclasses Roar because Soundproof
					if (hasMove['whirlwind'] || hasMove['dragontail'] || hasMove['haze'] || hasMove['circlethrow']) rejected = true;
					break;
				case 'substitute':
					if (hasMove['uturn'] || hasMove['voltswitch'] || hasMove['pursuit']) rejected = true;
					break;
				case 'fakeout':
					if (hasMove['trick'] || hasMove['switcheroo']) rejected = true;
					break;
				case 'feint':
					if (hasMove['fakeout']) rejected = true;
					break;
				case 'encore':
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (hasMove['whirlwind'] || hasMove['dragontail'] || hasMove['roar'] || hasMove['circlethrow']) rejected = true;
					break;
				case 'suckerpunch':
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					break;
				case 'cottonguard':
					if (hasMove['reflect']) rejected = true;
					break;
				case 'lightscreen':
					if (hasMove['calmmind']) rejected = true;
					break;
				case 'rockpolish': case 'agility': case 'autotomize':
					if (!counter.setupType && !hasMove['batonpass'] && hasMove['thunderwave']) rejected = true;
					if ((hasMove['stealthrock'] || hasMove['spikes'] || hasMove['toxicspikes']) && !hasMove['batonpass']) rejected = true;
					break;
				case 'thunderwave':
					if (counter.setupType && (hasMove['rockpolish'] || hasMove['agility'])) rejected = true;
					if (hasMove['discharge'] || hasMove['trickroom']) rejected = true;
					if (hasMove['rest'] && hasMove['sleeptalk']) rejected = true;
					if (hasMove['yawn'] || hasMove['spore'] || hasMove['sleeppowder']) rejected = true;
					break;
				case 'lavaplume':
					if (hasMove['willowisp']) rejected = true;
					break;
				case 'trickroom':
					if (hasMove['rockpolish'] || hasMove['agility'] || hasMove['icywind']) rejected = true;
					break;
				case 'willowisp':
					if (hasMove['scald'] || hasMove['yawn'] || hasMove['spore'] || hasMove['sleeppowder']) rejected = true;
					break;
				case 'toxic':
					if (hasMove['thunderwave'] || hasMove['willowisp'] || hasMove['scald'] || hasMove['yawn'] || hasMove['spore'] || hasMove['sleeppowder']) rejected = true;
					break;

				// Z-status
				case 'hypnosis':
					if ((teamDetails.zMove || !counter.setupType) && template.baseStats.spe < 100) rejected = true;
					break;
				}

				// Increased/decreased priority moves unneeded with moves that boost only speed
				if (move.priority !== 0 && (hasMove['rockpolish'] || hasMove['agility'])) {
					rejected = true;
				}

				if (move.category === 'Special' && counter.setupType === 'Physical' && !SetupException.includes(moveid)) {
					rejected = true;
				}
				if (move.category === 'Physical' && (counter.setupType === 'Special' || hasMove['acidspray']) && !SetupException.includes(moveid)) {
					rejected = true;
				}

				// This move doesn't satisfy our setup requirements:
				if (counter.setupType === 'Physical' && move.category !== 'Physical' && counter['Physical'] < 2) {
					rejected = true;
				}
				if (counter.setupType === 'Special' && move.category !== 'Special' && counter['Special'] < 2) {
					rejected = true;
				}

				// Hidden Power isn't good enough
				if (counter.setupType === 'Special' && moveid === 'hiddenpower' && counter['Special'] <= 2 && (!hasMove['shadowball'] || move.type !== 'Fighting')) {
					rejected = true;
				}

				// Pokemon should have moves that benefit their Ability/Type/Weather, as well as moves required by its forme
				if ((hasType['Bug'] && !hasMove['batonpass'] && (movePool.includes('megahorn') || movePool.includes('pinmissile') || (hasType['Flying'] && !hasMove['hurricane'] && movePool.includes('bugbuzz')))) ||
					(hasType['Dark'] && hasMove['suckerpunch'] && counter.stab < template.types.length) ||
					(hasType['Dragon'] && !counter['Dragon'] && !hasAbility['Aerilate'] && !hasAbility['Pixilate'] && !hasMove['rest'] && !hasMove['sleeptalk']) ||
					(hasType['Electric'] && !counter['Electric']) ||
					(hasType['Fighting'] && !counter['Fighting'] && (counter.setupType || !counter['Status'])) ||
					(hasType['Fire'] && !counter['Fire']) ||
					(hasType['Ground'] && !counter['Ground']) ||
					(hasType['Ice'] && !counter['Ice'] && !hasAbility['Refrigerate']) ||
					(hasType['Psychic'] && !!counter['Psychic'] && !hasType['Flying'] && !hasAbility['Pixilate'] && template.types.length > 1 && counter.stab < 2) ||
					(hasType['Water'] && !counter['Water'] && (!hasType['Ice'] || !counter['Ice']) && !hasAbility['Protean']) ||
					((hasAbility['Adaptability'] && !counter.setupType && template.types.length > 1 && (!counter[template.types[0]] || !counter[template.types[1]])) ||
					((hasAbility['Aerilate'] || hasAbility['Pixilate'] || hasAbility['Refrigerate']) && !counter['Normal']) ||
					(hasAbility['Contrary'] && !counter['contrary'] && template.species !== 'Shuckle') ||
					(hasAbility['Dark Aura'] && !counter['Dark']) ||
					(hasAbility['Electric Surge'] && !counter['Electric']) ||
					(hasAbility['Gale Wings'] && !counter['Flying']) ||
					(hasAbility['Grassy Surge'] && !counter['Grass']) ||
					(hasAbility['Guts'] && hasType['Normal'] && movePool.includes('facade')) ||
					(hasAbility['Psychic Surge'] && !counter['Psychic']) ||
					(hasAbility['Slow Start'] && movePool.includes('substitute')) ||
					(hasAbility['Stance Change'] && !counter.setupType && movePool.includes('kingsshield')) ||
					(hasAbility['Water Bubble'] && !counter['Water']) ||
					(counter['defensesetup'] && !counter.recovery && !hasMove['rest']) ||
					(movePool.includes('technoblast') || template.requiredMove && movePool.includes(toId(template.requiredMove)))) &&
					(counter['physicalsetup'] + counter['specialsetup'] < 2 && (!counter.setupType || counter.setupType === 'Mixed' || (move.category !== counter.setupType && move.category !== 'Status') || counter[counter.setupType] + counter.Status > 3))) {
					// Reject Status or non-STAB
					if (!isSetup && !move.weather && moveid !== 'judgment' && moveid !== 'rest' && moveid !== 'sleeptalk') {
						if (move.category === 'Status' || !hasType[move.type] || (move.basePower && move.basePower < 40 && !move.multihit)) rejected = true;
					}
				}

				// Remove rejected moves from the move list.
				if (rejected && (movePool.length - availableHP || availableHP && (moveid === 'hiddenpower' || !hasMove['hiddenpower']))) {
					moves.splice(k, 1);
					break;
				}
			}
			if (moves.length === 4 && !counter.stab && !hasMove['metalburst'] && (counter['physicalpool'] || counter['specialpool'])) {
				// Move post-processing:
				if (counter.damagingMoves.length === 0) {
					// A set shouldn't have no attacking moves
					moves.splice(this.random(moves.length), 1);
				} else if (counter.damagingMoves.length === 1) {
					// In most cases, a set shouldn't have no STAB
					let damagingid = counter.damagingMoves[0].id;
					if (movePool.length - availableHP || availableHP && (damagingid === 'hiddenpower' || !hasMove['hiddenpower'])) {
						let replace = false;
						if (!counter.damagingMoves[0].damage && template.species !== 'Porygon2') {
							let damagingType = counter.damagingMoves[0].type;
							if (damagingType === 'Fairy') {
								// Mono-Fairy is acceptable for Psychic types
								if (counter.setupType !== 'Special' || template.types.length > 1 || !hasType['Psychic']) replace = true;
							} else {
								replace = true;
							}
						}
						if (replace) moves.splice(counter.damagingMoveIndex[damagingid], 1);
					}
				} else if (!counter.damagingMoves[0].damage && !counter.damagingMoves[1].damage && template.species !== 'Porygon2') {
					// If you have three or more attacks, and none of them are STAB, reject one of them at random.
					let rejectableMoves = [];
					let baseDiff = movePool.length - availableHP;
					for (let l = 0; l < counter.damagingMoves.length; l++) {
						if (counter.damagingMoves[l].id === 'technoblast') continue;
						if (baseDiff || availableHP && (!hasMove['hiddenpower'] || counter.damagingMoves[l].id === 'hiddenpower')) {
							rejectableMoves.push(counter.damagingMoveIndex[counter.damagingMoves[l].id]);
						}
					}
					if (rejectableMoves.length) {
						moves.splice(rejectableMoves[this.random(rejectableMoves.length)], 1);
					}
				}
			}
		} while (moves.length < 4 && movePool.length);

		// any moveset modification goes here
		//moves[0] = 'safeguard';
		let changedMove = false;
		if (template.requiredMove && !hasMove[toId(template.requiredMove)]) {
			delete hasMove[this.getMove(moves[3]).id];
			moves[3] = toId(template.requiredMove);
			hasMove[toId(template.requiredMove)] = true;
			changedMove = true;
		}

		// Re-query in case a moveset modification occurred
		if (changedMove) counter = this.queryMoves(moves, hasType, hasAbility);

		let abilities = Object.values(baseTemplate.abilities);
		abilities.sort((a, b) => this.getAbility(b).rating - this.getAbility(a).rating);
		let ability0 = this.getAbility(abilities[0]);
		let ability1 = this.getAbility(abilities[1]);
		let ability2 = this.getAbility(abilities[2]);
		ability = ability0.name;
		if (abilities[1]) {
			if (abilities[2] && ability2.rating === ability1.rating) {
				if (this.random(2)) ability1 = ability2;
			}
			if (ability0.rating <= ability1.rating) {
				if (this.random(2)) ability = ability1.name;
			} else if (ability0.rating - 0.6 <= ability1.rating) {
				if (!this.random(3)) ability = ability1.name;
			}

			let rejectAbility = false;
			if (counterAbilities.includes(ability)) {
				rejectAbility = !counter[toId(ability)];
			} else if (ateAbilities.includes(ability)) {
				rejectAbility = !counter['Normal'];
			} else if (ability === 'Blaze') {
				rejectAbility = !counter['Fire'];
			} else if (ability === 'Chlorophyll') {
				rejectAbility = !hasMove['sunnyday'];
			} else if (ability === 'Compound Eyes' || ability === 'No Guard') {
				rejectAbility = !counter['inaccurate'];
			} else if (ability === 'Defiant' || ability === 'Moxie') {
				rejectAbility = !counter['Physical'] && !hasMove['batonpass'];
			} else if (ability === 'Limber') {
				rejectAbility = template.types.includes('Electric');
			} else if (ability === 'Lightning Rod') {
				rejectAbility = template.types.includes('Ground');
			} else if (ability === 'Liquid Voice') {
				rejectAbility = !hasMove['hypervoice'];
			} else if (ability === 'Moody') {
				rejectAbility = template.id !== 'bidoof';
			} else if (ability === 'Overgrow') {
				rejectAbility = !counter['Grass'];
			} else if (ability === 'Poison Heal') {
				rejectAbility = abilities.includes('Technician') && !!counter['technician'];
			} else if (ability === 'Prankster') {
				rejectAbility = !counter['Status'];
			} else if (ability === 'Quick Feet') {
				rejectAbility = hasMove['bellydrum'] && abilities.includes('Gluttony');
			} else if (ability === 'Reckless' || ability === 'Rock Head') {
				rejectAbility = !counter['recoil'];
			} else if (ability === 'Serene Grace') {
				rejectAbility = !counter['serenegrace'] || template.id === 'chansey' || template.id === 'blissey';
			} else if (ability === 'Sheer Force') {
				rejectAbility = !counter['sheerforce'] || hasMove['fakeout'] || (abilities.includes('Iron Fist') && counter['sheerforce'] < 2 && counter['ironfist'] > counter['sheerforce']);
			} else if (ability === 'Simple') {
				rejectAbility = !counter.setupType && !hasMove['cosmicpower'] && !hasMove['flamecharge'];
			} else if (ability === 'Snow Cloak') {
				rejectAbility = !teamDetails['hail'];
			} else if (ability === 'Solar Power') {
				rejectAbility = !counter['Special'] || template.isMega;
			} else if (ability === 'Strong Jaw') {
				rejectAbility = !counter['bite'];
			} else if (ability === 'Sturdy') {
				rejectAbility = !!counter['recoil'] && !counter['recovery'];
			} else if (ability === 'Swift Swim') {
				rejectAbility = !hasMove['raindance'] && !teamDetails['rain'];
			} else if (ability === 'Swarm') {
				rejectAbility = !counter['Bug'];
			} else if (ability === 'Synchronize') {
				rejectAbility = counter.Status < 2;
			} else if (ability === 'Technician') {
				rejectAbility = !counter['technician'] || (abilities.includes('Skill Link') && counter['skilllink'] >= counter['technician']);
			} else if (ability === 'Tinted Lens') {
				rejectAbility = counter['damage'] >= counter.damagingMoves.length;
			} else if (ability === 'Torrent') {
				rejectAbility = !counter['Water'];
			} else if (ability === 'Unburden') {
				rejectAbility = template.baseStats.spe > 120 || (template.id === 'slurpuff' && !counter.setupType);
			} else if (ability === 'Water Absorb') {
				rejectAbility = abilities.includes('Volt Absorb') || (abilities.includes('Water Bubble') && counter['Water']);
			}

			if (rejectAbility) {
				if (ability === ability1.name) { // or not
					ability = ability0.name;
				} else if (ability1.rating > 0) { // only switch if the alternative doesn't suck
					ability = ability1.name;
				}
			}
			if (abilities.includes('Chlorophyll') && ability !== 'Solar Power') {
				ability = 'Chlorophyll';
			}
			if (abilities.includes('Guts') && ability !== 'Quick Feet' && hasMove['facade']) {
				ability = 'Guts';
			}
			if (abilities.includes('Intimidate') || template.id === 'mawilemega') {
				ability = 'Intimidate';
			}
			if (abilities.includes('Liquid Voice') && hasMove['hypervoice']) {
				ability = 'Liquid Voice';
			}
			if (abilities.includes('Swift Swim') && hasMove['raindance']) {
				ability = 'Swift Swim';
			}

			if (template.id === 'ambipom' && !counter['technician']) {
				// If it doesn't qualify for Technician, Skill Link is useless on it
				// Might as well give it Pickup just in case
				ability = 'Pickup';
			} else if (template.id === 'aurorus' && ability === 'Snow Warning' && hasMove['hypervoice']) {
				for (let i = 0; i < moves.length; i++) {
					if (moves[i] === 'hypervoice') {
						moves[i] = 'blizzard';
						counter['Normal'] = 0;
						break;
					}
				}
			} else if (template.baseSpecies === 'Basculin') {
				ability = 'Adaptability';
			} else if (template.id === 'gligar') {
				ability = 'Immunity';
			} else if (template.id === 'lilligant' && hasMove['petaldance']) {
				ability = 'Own Tempo';
			} else if (template.id === 'rampardos' && !hasMove['headsmash']) {
				ability = 'Sheer Force';
			} else if (template.id === 'rhyperior') {
				ability = 'Solid Rock';
			} else if (template.id === 'unfezant') {
				ability = 'Super Luck';
			} else if (template.id === 'venusaurmega') {
				ability = 'Chlorophyll';
			}
		}

		// check IVs/EVs for Gyro Ball and TR
		if (hasMove['gyroball'] || hasMove['trickroom']) {
			ivs.spe = 0;
			evs.spe = 0;
		}

		item = 'Sitrus Berry';
		// First, the extra high-priority items
		if (template.requiredItems) {
			if (template.baseSpecies === 'Arceus' && hasMove['judgment'] && !teamDetails.zMove) {
				// Judgment doesn't change type with Z-Crystals
				item = template.requiredItems[0];
			} else {
				item = template.requiredItems[this.random(template.requiredItems.length)];
			}
		} else if (ability === 'Imposter') {
			item = 'Choice Scarf';
		} else if (ability === 'Wonder Guard') {
			item = 'Focus Sash';
		} else if (template.species === 'Unown') {
			item = 'Choice Specs';
		} else if (hasMove['trick'] || hasMove['switcheroo']) {
			let randomNum = this.random(2);
			if (counter.Physical >= 3 && (template.baseStats.spe >= 95 || randomNum)) {
				item = 'Choice Band';
			} else if (counter.Special >= 3 && (template.baseStats.spe >= 95 || randomNum)) {
				item = 'Choice Specs';
			} else {
				item = 'Choice Scarf';
			}
		} else if (ability === 'Gluttony' || ability === 'Schooling') {
			item = ['Aguav', 'Figy', 'Iapapa', 'Mago', 'Wiki'][this.random(5)] + ' Berry';
		} else if (hasMove['bellydrum']) {
			if (template.baseStats.spe <= 50 && !teamDetails.zMove && this.random(2)) {
				item = 'Normalium Z';
			} else {
				item = 'Sitrus Berry';
			}
		} else if (hasMove['hypnosis'] && (!teamDetails.zMove && counter.setupType && template.baseStats.spe < 100)) {
			item = 'Psychium Z';
		} else if (hasMove['rest'] && !hasMove['sleeptalk'] && ability !== 'Natural Cure' && ability !== 'Shed Skin') {
			item = 'Chesto Berry';
		} else if (hasMove['naturalgift']) {
			item = 'Liechi Berry';
		} else if (hasMove['geomancy']) {
			item = 'Power Herb';
		} else if (ability === 'Harvest') {
			item = 'Sitrus Berry';
		} else if (template.species === 'Cubone' || template.baseSpecies === 'Marowak') {
			item = 'Thick Club';
		} else if (template.baseSpecies === 'Pikachu') {
			item = 'Light Ball';
		} else if (template.species === 'Clamperl') {
			item = 'Deep Sea Tooth';
		} else if (template.species === 'Spiritomb') {
			item = 'Leftovers';
		} else if (template.species === 'Scrafty' && counter['Status'] === 0) {
			item = 'Assault Vest';
		} else if (template.species === 'Farfetch\'d') {
			item = 'Stick';
		} else if (template.species === 'Amoonguss') {
			item = 'Black Sludge';
		} else if (template.species === 'Dedenne') {
			item = 'Petaya Berry';
		} else if (template.species === 'Wobbuffet') {
			item = hasMove['destinybond'] ? 'Custap Berry' : 'Sitrus Berry';
		} else if (template.species === 'Raichu-Alola' && hasMove['thunderbolt'] && !teamDetails.zMove && this.random(4) < 1) {
			item = 'Aloraichium Z';
		} else if (hasMove['focusenergy'] || (template.species === 'Unfezant' && counter['Physical'] >= 2)) {
			item = 'Scope Lens';
		} else if (template.evos.length) {
			item = 'Eviolite';
		} else if ((hasMove['reflect'] && hasMove['lightscreen']) || hasMove['auroraveil']) {
			item = 'Light Clay';
		} else if (hasMove['shellsmash']) {
			item = (ability === 'Solid Rock' && counter['priority']) ? 'Weakness Policy' : 'White Herb';
		} else if (hasMove['facade'] || ability === 'Poison Heal' || ability === 'Toxic Boost') {
			item = 'Toxic Orb';
		} else if (hasMove['raindance']) {
			item = 'Damp Rock';
		} else if (hasMove['sunnyday']) {
			item = 'Heat Rock';
		} else if (hasMove['sandstorm']) {
			item = 'Smooth Rock';
		} else if (hasMove['hail']) {
			item = 'Icy Rock';
		} else if (ability === 'Magic Guard' && hasMove['psychoshift']) {
			item = 'Flame Orb';
		} else if (ability === 'Sheer Force' || ability === 'Magic Guard') {
			item = 'Life Orb';
		} else if (ability === 'Unburden') {
			if (hasMove['fakeout']) {
				item = 'Normal Gem';
			} else {
				item = 'Sitrus Berry';
			}
		} else if (hasMove['acrobatics']) {
			item = '';

		// medium priority
		} else if (ability === 'Guts') {
			item = hasType['Fire'] ? 'Toxic Orb' : 'Flame Orb';
		} else if (ability === 'Marvel Scale') {
			item = 'Flame Orb';
		} else if (counter.Physical >= 4 && template.baseStats.spe > 55 && !hasMove['fakeout'] && !hasMove['flamecharge'] && !hasMove['rapidspin'] && !hasMove['suckerpunch'] && ability !== 'Sturdy' && ability !== 'Multiscale') {
			item = 'Life Orb';
		} else if (counter.Special >= 4 && template.baseStats.spe > 55 && !hasMove['eruption'] && !hasMove['waterspout'] && ability !== 'Sturdy') {
			item = 'Life Orb';
		} else if (this.getImmunity('Ground', template) && this.getEffectiveness('Ground', template) >= 2 && ability !== 'Levitate' && !hasMove['magnetrise']) {
			item = 'Air Balloon';
		} else if (this.getEffectiveness('Ice', template) >= 2) {
			item = 'Yache Berry';
		} else if (this.getEffectiveness('Rock', template) >= 2) {
			item = 'Charti Berry';
		} else if (this.getEffectiveness('Fire', template) >= 2) {
			item = 'Occa Berry';
		} else if (this.getImmunity('Fighting', template) && this.getEffectiveness('Fighting', template) >= 2) {
			item = 'Chople Berry';
		} else if (ability === 'Iron Barbs' || ability === 'Rough Skin') {
			item = 'Rocky Helmet';
		} else if (counter.Physical + counter.Special >= 4 && ability === 'Regenerator' && template.baseStats[counter.Special >= 2 ? 'atk' : 'spa'] > 99 && template.baseStats.spe <= 80) {
			item = 'Assault Vest';
		} else if ((template.baseStats.hp + 75) * (template.baseStats.def + template.baseStats.spd + 175) > 60000 || template.species === 'Skarmory' || template.species === 'Forretress') {
			// Skarmory and Forretress get exceptions for their typing
			item = 'Sitrus Berry';
		} else if (counter.Physical + counter.Special >= 3 && counter.setupType && ability !== 'Sturdy' && ability !== 'Multiscale') {
			item = 'Life Orb';
		} else if (counter.Special >= 3 && counter.setupType && ability !== 'Sturdy') {
			item = 'Life Orb';
		} else if (counter.Physical + counter.Special >= 4 && template.baseStats.def + template.baseStats.spd > 179) {
			item = 'Assault Vest';
		} else if (counter.damagingMoves.length >= 3 && !!counter['speedsetup'] && template.baseStats.hp + template.baseStats.def + template.baseStats.spd >= 300) {
			item = 'Weakness Policy';
		} else if (counter.Physical + counter.Special >= 4) {
			item = 'Expert Belt';
		} else if (hasMove['outrage']) {
			item = 'Lum Berry';
		} else if (hasMove['substitute'] || hasMove['detect'] || hasMove['protect'] || ability === 'Moody') {
			item = 'Leftovers';
		} else if (this.getImmunity('Ground', template) && this.getEffectiveness('Ground', template) >= 1 && ability !== 'Levitate' && !hasMove['magnetrise']) {
			item = 'Air Balloon';
		} else if (this.getEffectiveness('Ice', template) >= 1) {
			item = 'Yache Berry';

		// this is the "REALLY can't think of a good item" cutoff
		} else if (counter.Physical + counter.Special >= 2 && template.baseStats.hp + template.baseStats.def + template.baseStats.spd > 315) {
			item = 'Weakness Policy';
		} else if (ability === 'Sturdy' && hasMove['explosion'] && !counter['speedsetup']) {
			item = 'Custap Berry';
		} else if (ability === 'Super Luck') {
			item = 'Scope Lens';
		} else if (ability === 'Gale Wings' && hasMove['bravebird']) {
			item = !teamDetails.zMove ? 'Flyinium Z' : 'Sharp Beak';
		} else if (hasType['Poison']) {
			item = 'Black Sludge';
		} else if (counter.Status <= 1 && ability !== 'Sturdy' && ability !== 'Multiscale') {
			item = 'Life Orb';
		} else {
			item = 'Sitrus Berry';
		}

		// For Trick / Switcheroo
		if (item === 'Leftovers' && hasType['Poison']) {
			item = 'Black Sludge';
		}

		// We choose level based on BST. Min level is 70, max level is 99. 600+ BST is 70, less than 300 is 99. Calculate with those values.
		// Every 10.34 BST adds a level from 70 up to 99. Results are floored. Uses the Mega's stats if holding a Mega Stone
		let baseStats = template.baseStats;
		// If Wishiwashi, use the school-forme's much higher stats
		if (template.baseSpecies === 'Wishiwashi') baseStats = this.getTemplate('wishiwashischool').baseStats;

		let bst = baseStats.hp + baseStats.atk + baseStats.def + baseStats.spa + baseStats.spd + baseStats.spe;
		// Adjust levels of mons based on abilities (Pure Power, Sheer Force, etc.) and also Eviolite
		// For the stat boosted, treat the Pokemon's base stat as if it were multiplied by the boost. (Actual effective base stats are higher.)
		let templateAbility = (baseTemplate === template ? ability : template.abilities[0]);
		if (templateAbility === 'Huge Power' || templateAbility === 'Pure Power') {
			bst += baseStats.atk;
		} else if (templateAbility === 'Parental Bond') {
			bst += 0.25 * (counter.Physical > counter.Special ? baseStats.atk : baseStats.spa);
		} else if (templateAbility === 'Protean') {
			bst += 0.3 * (counter.Physical > counter.Special ? baseStats.atk : baseStats.spa);
		} else if (templateAbility === 'Fur Coat') {
			bst += baseStats.def;
		} else if (templateAbility === 'Slow Start') {
			bst -= baseStats.atk / 2 + baseStats.spe / 2;
		} else if (templateAbility === 'Truant') {
			bst *= 2 / 3;
		}
		if (item === 'Eviolite') {
			bst += 0.5 * (baseStats.def + baseStats.spd);
		}
		let level = 70 + Math.floor(((600 - this.clampIntRange(bst, 300, 600)) / 10.34));

		// Prepare optimal HP
		let hp = Math.floor(Math.floor(2 * template.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
		if (hasMove['substitute'] && (item === 'Sitrus Berry' || (ability === 'Power Construct' && item !== 'Leftovers'))) {
			// Two Substitutes should activate Sitrus Berry or Power Construct
			while (hp % 4 > 0) {
				evs.hp -= 4;
				hp = Math.floor(Math.floor(2 * template.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
			}
		} else if (hasMove['bellydrum'] && (item === 'Sitrus Berry' || ability === 'Gluttony')) {
			// Belly Drum should activate Sitrus Berry
			if (hp % 2 > 0) evs.hp -= 4;
		} else if (hasMove['substitute'] && hasMove['reversal']) {
			// Reversal users should be able to use four Substitutes
			if (hp % 4 === 0) evs.hp -= 4;
		}

		// Minimize unused attack stats
		if (!counter['Physical'] && !hasMove['copycat'] && !hasMove['transform'] && !hasMove['mirrormove']) {
			evs.atk = 0;
			ivs.atk = 0;
		}
		if (!counter['Special'] && !hasMove['copycat'] && !hasMove['transform'] && !hasMove['mirrormove']) {
			evs.spa = 0;
			ivs.spa = 0;
		}

		return {
			name: template.baseSpecies,
			species: species,
			moves: moves,
			ability: ability,
			evs: evs,
			ivs: ivs,
			item: item,
			level: level,
			shiny: !this.random(template.id === 'missingno' ? 4 : 1024),
		};
	}
	randomFactorySet(template, slot, teamData, tier) {
		let speciesId = toId(template.species);
		// let flags = this.randomFactorySets[tier][speciesId].flags;
		let setList = this.randomFactorySets[tier][speciesId].sets;
		let effectivePool, priorityPool;

		let itemsMax = {'choicespecs': 1, 'choiceband': 1, 'choicescarf': 1};
		let movesMax = {'rapidspin': 1, 'batonpass': 1, 'stealthrock': 1, 'defog': 1, 'spikes': 1, 'toxicspikes': 1};
		let requiredMoves = {'stealthrock': 'hazardSet', 'rapidspin': 'hazardClear', 'defog': 'hazardClear'};
		let weatherAbilitiesRequire = {
			'hydration': 'raindance', 'swiftswim': 'raindance',
			'leafguard': 'sunnyday', 'solarpower': 'sunnyday', 'chlorophyll': 'sunnyday',
			'sandforce': 'sandstorm', 'sandrush': 'sandstorm', 'sandveil': 'sandstorm',
			'snowcloak': 'hail',
		};
		let weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		effectivePool = [];
		priorityPool = [];
		for (let i = 0, l = setList.length; i < l; i++) {
			let curSet = setList[i];
			let itemData = this.getItem(curSet.item);
			if (teamData.megaCount > 0 && itemData.megaStone) continue; // reject 2+ mega stones
			if (itemsMax[itemData.id] && teamData.has[itemData.id] >= itemsMax[itemData.id]) continue;

			let abilityData = this.getAbility(curSet.ability);
			if (weatherAbilitiesRequire[abilityData.id] && teamData.weather !== weatherAbilitiesRequire[abilityData.id]) continue;
			if (teamData.weather && weatherAbilities.includes(abilityData.id)) continue; // reject 2+ weather setters

			let reject = false;
			let hasRequiredMove = false;
			let curSetVariants = [];
			for (let j = 0, m = curSet.moves.length; j < m; j++) {
				let variantIndex = this.random(curSet.moves[j].length);
				let moveId = toId(curSet.moves[j][variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return false;
			for (let i = 0; i < setList.length; i++) {
				effectivePool.push({set: setList[i]});
			}
		}

		let setData = effectivePool[this.random(effectivePool.length)];
		let moves = [];
		for (let i = 0; i < setData.set.moves.length; i++) {
			let moveSlot = setData.set.moves[i];
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : moveSlot[this.random(moveSlot.length)]);
		}

		return {
			name: setData.set.name || template.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || template.gender || (this.random(2) ? 'M' : 'F'),
			item: setData.set.item || '',
			ability: setData.set.ability || template.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? !this.random(1024) : setData.set.shiny,
			level: 100,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: setData.set.evs || {hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84},
			ivs: setData.set.ivs || {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
			nature: setData.set.nature || 'Serious',
			moves: moves,
		};
	}
	randomFactoryTeam(depth = 0) {
		let forceResult = (depth >= 4);

		// The teams generated depend on the tier choice in such a way that
		// no exploitable information is leaked from rolling the tier in getTeam(p1).
		let availableTiers = ['Uber', 'OU', 'UU', 'RU', 'NU', 'PU'];
		if (!this.factoryTier) this.factoryTier = availableTiers[this.random(availableTiers.length)];
		const chosenTier = this.factoryTier;

		let pokemon = [];

		let pokemonPool = Object.keys(this.randomFactorySets[chosenTier]);

		let teamData = {typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, has: {}, forceResult: forceResult, weaknesses: {}, resistances: {}};
		let requiredMoveFamilies = ['hazardSet', 'hazardClear'];
		let requiredMoves = {'stealthrock': 'hazardSet', 'rapidspin': 'hazardClear', 'defog': 'hazardClear'};
		let weatherAbilitiesSet = {'drizzle': 'raindance', 'drought': 'sunnyday', 'snowwarning': 'hail', 'sandstream': 'sandstorm'};
		let resistanceAbilities = {
			'dryskin': ['Water'], 'waterabsorb': ['Water'], 'stormdrain': ['Water'],
			'flashfire': ['Fire'], 'heatproof': ['Fire'],
			'lightningrod': ['Electric'], 'motordrive': ['Electric'], 'voltabsorb': ['Electric'],
			'sapsipper': ['Grass'],
			'thickfat': ['Ice', 'Fire'],
			'levitate': ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < 6) {
			let template = this.getTemplate(this.sampleNoReplace(pokemonPool));
			if (!template.exists) continue;

			let speciesFlags = this.randomFactorySets[chosenTier][template.speciesid].flags;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[template.baseSpecies]) continue;

			// Limit the number of Megas to one
			if (teamData.megaCount >= 1 && speciesFlags.megaOnly) continue;

			// Limit 2 of any type
			let types = template.types;
			let skip = false;
			for (let t = 0; t < types.length; t++) {
				if (teamData.typeCount[types[t]] > 1 && this.random(5)) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			let set = this.randomFactorySet(template, pokemon.length, teamData, chosenTier);
			if (!set) continue;

			// Limit 1 of any type combination
			let typeCombo = types.slice().sort().join();
			if (set.ability === 'Drought' || set.ability === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
				typeCombo = set.ability;
			}
			if (typeCombo in teamData.typeComboCount) continue;

			// Okay, the set passes, add it to our team
			pokemon.push(set);

			// Now that our Pokemon has passed all checks, we can update team data:
			for (let t = 0; t < types.length; t++) {
				if (types[t] in teamData.typeCount) {
					teamData.typeCount[types[t]]++;
				} else {
					teamData.typeCount[types[t]] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = 1;

			teamData.baseFormes[template.baseSpecies] = 1;

			let itemData = this.getItem(set.item);
			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.id in teamData.has) {
				teamData.has[itemData.id]++;
			} else {
				teamData.has[itemData.id] = 1;
			}

			let abilityData = this.getAbility(set.ability);
			if (abilityData.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityData.id];
			}

			for (let m = 0; m < set.moves.length; m++) {
				let moveId = toId(set.moves[m]);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (let typeName in this.data.TypeChart) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityData.id] && resistanceAbilities[abilityData.id].includes(typeName) || !this.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				let typeMod = this.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < 6) return this.randomFactoryTeam(++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (let requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomFactoryTeam(++depth);
			}
			for (let type in teamData.weaknesses) {
				if (teamData.weaknesses[type] >= 3) return this.randomFactoryTeam(++depth);
			}
		}

		return pokemon;
	}
	randomBSSFactorySet(template, slot, teamData, tier) {
		let speciesId = toId(template.species);
		// let flags = this.randomBSSFactorySets[tier][speciesId].flags;
		let setList = this.randomBSSFactorySets[tier][speciesId].sets;
		let effectivePool, priorityPool;

		let movesMax = {'batonpass': 1, 'stealthrock': 1, 'spikes': 1, 'toxicspikes': 1, 'doubleedge': 1, 'trickroom': 1};
		let requiredMoves = {};
		let weatherAbilitiesRequire = {
			'swiftswim': 'raindance',
			'sandrush': 'sandstorm', 'sandveil': 'sandstorm',
		};
		let weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		effectivePool = [];
		priorityPool = [];
		for (let i = 0, l = setList.length; i < l; i++) {
			let curSet = setList[i];
			let itemData = this.getItem(curSet.item);
			if (teamData.megaCount > 1 && itemData.megaStone) continue; // reject 3+ mega stones
			if (teamData.zCount > 1 && itemData.zMove) continue; // reject 3+ Z stones
			if (teamData.has[itemData.id]) continue; // Item clause

			let abilityData = this.getAbility(curSet.ability);
			if (weatherAbilitiesRequire[abilityData.id] && teamData.weather !== weatherAbilitiesRequire[abilityData.id]) continue;
			if (teamData.weather && weatherAbilities.includes(abilityData.id)) continue; // reject 2+ weather setters

			if (curSet.species === 'aron' && teamData.weather !== 'sandstorm') continue; // reject Aron without a Sand Stream user

			let reject = false;
			let hasRequiredMove = false;
			let curSetVariants = [];
			for (let j = 0, m = curSet.moves.length; j < m; j++) {
				let variantIndex = this.random(curSet.moves[j].length);
				let moveId = toId(curSet.moves[j][variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return false;
			for (let i = 0; i < setList.length; i++) {
				effectivePool.push({set: setList[i]});
			}
		}

		let setData = effectivePool[this.random(effectivePool.length)];
		let moves = [];
		for (let i = 0; i < setData.set.moves.length; i++) {
			let moveSlot = setData.set.moves[i];
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : moveSlot[this.random(moveSlot.length)]);
		}

		return {
			name: setData.set.nickname || setData.set.name || template.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || template.gender || (this.random(2) ? 'M' : 'F'),
			item: setData.set.item || '',
			ability: setData.set.ability || template.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? !this.random(1024) : setData.set.shiny,
			level: setData.set.level || 50,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: setData.set.evs || {hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84},
			ivs: setData.set.ivs || {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
			nature: setData.set.nature || 'Serious',
			moves: moves,
		};
	}
	randomBSSFactoryTeam(depth = 0) {
		let forceResult = (depth >= 4);

		// Make chosen tier always BSS
		const chosenTier = 'BSS';

		let pokemon = [];

		let pokemonPool = Object.keys(this.randomBSSFactorySets[chosenTier]);

		let teamData = {typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, zCount: 0, eeveeLimCount: 0, has: {}, forceResult: forceResult, weaknesses: {}, resistances: {}};
		let requiredMoveFamilies = [];
		let requiredMoves = {};
		let weatherAbilitiesSet = {'drizzle': 'raindance', 'drought': 'sunnyday', 'snowwarning': 'hail', 'sandstream': 'sandstorm'};
		let resistanceAbilities = {
			'waterabsorb': ['Water'],
			'flashfire': ['Fire'],
			'lightningrod': ['Electric'], 'voltabsorb': ['Electric'],
			'thickfat': ['Ice', 'Fire'],
			'levitate': ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < 6) {
			let template = this.getTemplate(this.sampleNoReplace(pokemonPool));
			if (!template.exists) continue;

			let speciesFlags = this.randomBSSFactorySets[chosenTier][template.speciesid].flags;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[template.baseSpecies]) continue;

			// Limit the number of Megas + Z-moves to 3
			if (teamData.megaCount + teamData.zCount >= 3 && speciesFlags.megaOnly) continue;

			// Limit 2 of any type
			let types = template.types;
			let skip = false;
			for (let t = 0; t < types.length; t++) {
				if (teamData.typeCount[types[t]] > 1 && this.random(5)) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			// Restrict Eevee with certain Pokemon
			if (speciesFlags.limEevee) teamData.eeveeLimCount++;
			if (teamData.eeveeLimCount >= 1 && speciesFlags.limEevee) continue;

			let set = this.randomBSSFactorySet(template, pokemon.length, teamData, chosenTier);
			if (!set) continue;

			// Limit 1 of any type combination
			let typeCombo = types.slice().sort().join();
			if (set.ability === 'Drought' || set.ability === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
				typeCombo = set.ability;
			}
			if (typeCombo in teamData.typeComboCount) continue;

			// Okay, the set passes, add it to our team
			pokemon.push(set);

			// Now that our Pokemon has passed all checks, we can update team data:
			for (let t = 0; t < types.length; t++) {
				if (types[t] in teamData.typeCount) {
					teamData.typeCount[types[t]]++;
				} else {
					teamData.typeCount[types[t]] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = 1;

			teamData.baseFormes[template.baseSpecies] = 1;

			// Limit Mega and Z-move
			let itemData = this.getItem(set.item);
			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.zMove) teamData.zCount++;
			teamData.has[itemData.id] = 1;

			let abilityData = this.getAbility(set.ability);
			if (abilityData.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityData.id];
			}

			for (let m = 0; m < set.moves.length; m++) {
				let moveId = toId(set.moves[m]);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (let typeName in this.data.TypeChart) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityData.id] && resistanceAbilities[abilityData.id].includes(typeName) || !this.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				let typeMod = this.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < 6) return this.randomBSSFactoryTeam(++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (let requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomBSSFactoryTeam(++depth);
			}
			for (let type in teamData.weaknesses) {
				if (teamData.weaknesses[type] >= 3) return this.randomBSSFactoryTeam(++depth);
			}
		}

		return pokemon;
	}
}

module.exports = RandomTeams;
