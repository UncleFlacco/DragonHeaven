'use strict';

exports.BattleMovedex = {
	"wrathofnature": {
		accuracy: 100,
		basePower: 100,
		category: "Physical",
		desc: "This move combines Fighting in its type effectiveness against the target.",
		shortDesc: "Combines Fighting in its type effectiveness.",
		id: "wrathofnature",
		name: "Wrath Of Nature",
		pp: 10,
		flags: {contact: 1, protect: 1, mirror: 1},
		onEffectiveness: function (typeMod, type, move) {
			return typeMod + this.getEffectiveness('Fighting', type);
		},
		priority: 0,
		secondary: false,
		target: "normal",
		type: "Grass",
		zMovePower: 180,
		contestType: "Tough",
        },
	"volcaniceruption": {
		accuracy: 100,
		basePower: 140,
		category: "Special",
		desc: "Has a 50% chance to burn the target.",
		shortDesc: "50% chance to burn the target.",
		id: "volcaniceruption",
		name: "Volcanic Eruption",
		pp: 5,
		priority: 0,
		flags: {protect: 1, mirror: 1},
		secondary: {
			chance: 10,
			status: 'brn',
		},
		target: "allAdjacent",
		type: "Fire",
		zMovePower: 200,
		contestType: "Cool",
	},
        "seenoevil": {
		accuracy: 100,
		basePower: 100,
		category: "Special",
		desc: "Has a 30% chance to lower the target's accuracy by 1 stage.",
		shortDesc: "30% chance to lower the foe(s) accuracy by 1.",
		id: "seenoevil",
		name: "See No Evil",
		pp: 10,
		priority: 0,
		flags: {protect: 1, mirror: 1},
		secondary: {
			chance: 30,
			boosts: {
				accuracy: -1,
			},
		},
		target: "normal",
		type: "Water",
		zMovePower: 180,
		contestType: "Clever",
	},
        "gigavoltimpact": {
		accuracy: 100,
		basePower: 100,
		category: "Physical",
		defensiveCategory: "Special",
		desc: "Deals damage to the target based on its Special Defense instead of Defense.",
		shortDesc: "Damages target based on Sp. Def, not Defense.",
		id: "gigavoltimpact",
		name: "Gigavolt Impact",
		pp: 10,
		priority: 0,
		flags: {protect: 1, mirror: 1},
		secondary: false,
		target: "normal",
		type: "Electric",
		zMovePower: 200,
		contestType: "Beautiful",
	},
};
