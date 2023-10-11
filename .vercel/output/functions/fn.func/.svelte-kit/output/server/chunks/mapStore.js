import { c as create_ssr_component, b as subscribe, a as add_attribute, p as get_store_value, o as onDestroy, q as set_store_value, e as escape, v as validate_component } from "./ssr.js";
import { w as writable } from "./index.js";
const spriteStore = writable({
  ground: {},
  units: {},
  sky: {}
});
const rendererStore = writable({
  ground: {},
  units: {},
  sky: {}
});
const terrainData = [
  {
    url: "game/play/terrain/plains.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 2,
    name: "Plains",
    description: "Basic terrain",
    details: "dirty",
    ocean: false,
    protection: 0.1,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/hills.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 2,
    name: "Hills",
    description: "Gives ranged units an extended range",
    details: "rough",
    ocean: false,
    protection: 0.2,
    damage: 0,
    height: 20,
    drag: 2,
    modifiers: ["CURMODS.Properties.Extra_Sight"]
  },
  {
    url: "game/play/terrain/forest.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 2,
    name: "Forest",
    description: "Gives defense boost",
    details: "rough",
    ocean: false,
    protection: 0.2,
    damage: 0,
    height: 5,
    drag: 2,
    modifiers: []
  },
  {
    url: "game/play/terrain/mountain.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 2,
    name: "Mountain",
    description: "Hard to traverse but gives strong defense",
    details: "rugged",
    ocean: false,
    protection: 0.4,
    damage: 0,
    height: 50,
    drag: 2,
    modifiers: ["CURMODS.Properties.Extra_Sight"]
  },
  {
    url: "game/play/terrain/road.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 1,
    name: "Road",
    description: "Easy to traverse but provides no defense",
    details: "clean",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/canyon.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 1,
    name: "Canyon",
    description: "Dips down, but ranged units cannot target here",
    details: "slippery",
    ocean: false,
    protection: 0.3,
    damage: 0,
    height: -10,
    drag: 1,
    modifiers: ["CURMODS.Properties.Trench"]
  },
  {
    url: "game/play/terrain/wasteland.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Wasteland",
    description: "Provides lots of defense, but costs health to rest on",
    details: "dirty",
    ocean: false,
    protection: 0.5,
    damage: 10,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/volcano.png",
    frames: 1,
    xOffset: 0,
    yOffset: 34,
    connector: 0,
    name: "Volcano",
    description: "Impassable",
    details: "impassable",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 100,
    drag: 100,
    modifiers: []
  },
  {
    url: "game/play/terrain/enriched-ore-deposit.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Enriched Ore Deposit",
    description: "Can be mined for money",
    details: "pot-holes",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/ore-deposit.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Ore Deposit",
    description: "Can be mined for money",
    details: "pot-holes",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/depleted-ore-deposit.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Depleted Ore Deposit",
    description: "Can be mined for money",
    details: "pot-holes",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/sea.png",
    frames: 3,
    xOffset: 0,
    yOffset: 0,
    connector: 3,
    name: "Sea",
    description: "Basic sea terrain",
    details: "clean",
    ocean: true,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/reef.png",
    frames: 3,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Reef",
    description: "Hard to traverse sea terrain",
    details: "dirty",
    ocean: true,
    protection: 0.1,
    damage: 0,
    height: 10,
    drag: 2,
    modifiers: []
  },
  {
    url: "game/play/terrain/archipelago.png",
    frames: 3,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Archipelago",
    description: "Rough sea terrain",
    details: "rough",
    ocean: true,
    protection: 0.2,
    damage: 0,
    height: 20,
    drag: 2,
    modifiers: []
  },
  {
    url: "game/play/terrain/rock-formation.png",
    frames: 3,
    xOffset: 0,
    yOffset: 0,
    connector: 0,
    name: "Rock Formation",
    description: "Rocky sea terrain",
    details: "rugged",
    ocean: true,
    protection: 0.7,
    damage: 20,
    height: 0,
    drag: 2,
    modifiers: []
  },
  {
    url: "game/play/terrain/shore.png",
    frames: 3,
    xOffset: 0,
    yOffset: 0,
    connector: 3,
    name: "Shore",
    description: "An easy access to the sea",
    details: "rough",
    ocean: true,
    protection: 0,
    damage: 0,
    height: 0,
    drag: 1,
    modifiers: ["CURMODS.Properties.Port"]
  },
  {
    url: "game/play/terrain/bridge.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 4,
    name: "Bridge",
    description: "Connects two islands, but provides no defense",
    details: "clean",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 10,
    drag: 1,
    modifiers: []
  },
  {
    url: "game/play/terrain/high-bridge.png",
    frames: 1,
    xOffset: 0,
    yOffset: 0,
    connector: 4,
    name: "High Bridge",
    description: "Connects two islands, and allows ships to pass, but provides no defense",
    details: "clean",
    ocean: false,
    protection: 0,
    damage: 0,
    height: 20,
    drag: 1,
    modifiers: []
  }
];
const COMMON_RANGE = [1, 1];
const unitData = [
  {
    url: "game/play/units/idle/strike-commando.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Strike Commando",
    description: "Basic land unit",
    type: 0,
    maxHealth: 40,
    armor: 0,
    power: 20,
    weaponType: 0,
    movement: 3,
    movementType: 0,
    range: COMMON_RANGE,
    sight: 2,
    cost: 75,
    actable: true,
    modifiers: [
      "CURMODS.Start_Turn.Capture",
      "CURMODS.Move.Tracking",
      "CURMODS.Self_Action.Transport",
      "CURMODS.Self_Action.Repairable"
    ],
    attackSFX: `SFXs.Retrieve('light gun')`,
    moveSFX: `SFXs.Retrieve('footstep')`
  },
  {
    url: "game/play/units/idle/heavy-commando.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Heavy Commando",
    description: "Basic land unit",
    type: 0,
    maxHealth: 40,
    armor: 0,
    power: 35,
    weaponType: 2,
    movement: 3,
    movementType: 0,
    range: COMMON_RANGE,
    sight: 2,
    cost: 100,
    actable: true,
    modifiers: [
      "CURMODS.Start_Turn.Capture",
      "CURMODS.Move.Tracking",
      "CURMODS.Self_Action.Transport",
      "CURMODS.Self_Action.Repairable"
    ],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('footstep')`
  },
  {
    url: "game/play/units/idle/flak-tank.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Flak Tank",
    description: "Very effective against air units",
    type: 0,
    maxHealth: 70,
    armor: 1,
    power: 17,
    weaponType: 0,
    movement: 6,
    movementType: 2,
    range: COMMON_RANGE,
    sight: 3,
    cost: 240,
    actable: true,
    modifiers: [
      "CURMODS.Can_Attack.Air_Raid",
      "CURMODS.Damage.Flak",
      "CURMODS.Self_Action.Repairable"
    ],
    attackSFX: `SFXs.Retrieve('machine gun')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/scorpion-tank.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Scorpion Tank",
    description: "Basic tank unit",
    type: 0,
    maxHealth: 70,
    armor: 1,
    power: 35,
    weaponType: 1,
    movement: 6,
    movementType: 2,
    range: COMMON_RANGE,
    sight: 3,
    cost: 270,
    actable: true,
    modifiers: [
      "CURMODS.Damage.Fast_Attack",
      "CURMODS.Self_Action.Repairable",
      "CURMODS.Can_Attack.Bombard"
    ],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/lance-tank.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Lance Tank",
    description: "Can hit space directly behind enemy",
    type: 0,
    maxHealth: 70,
    armor: 1,
    power: 35,
    weaponType: 1,
    movement: 6,
    movementType: 2,
    range: COMMON_RANGE,
    sight: 3,
    cost: 270,
    actable: true,
    modifiers: [
      "CURMODS.Attack.Lance",
      "CURMODS.Self_Action.Repairable",
      "CURMODS.Can_Attack.Bombard"
    ],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/spider-tank.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Spider Tank",
    description: "Can climb mountains",
    type: 0,
    maxHealth: 40,
    armor: 1,
    power: 40,
    weaponType: 1,
    movement: 4,
    movementType: 0,
    range: COMMON_RANGE,
    sight: 3,
    cost: 250,
    actable: true,
    modifiers: ["CURMODS.Attack.Stun", "CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('light gun')`,
    moveSFX: `SFXs.Retrieve('footstep')`
  },
  {
    url: "game/play/units/idle/stealth-tank.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Stealth Tank",
    description: "Can hide itself",
    type: 0,
    maxHealth: 40,
    armor: 1,
    power: 30,
    weaponType: 0,
    movement: 5,
    movementType: 2,
    range: COMMON_RANGE,
    sight: 3,
    cost: 340,
    actable: true,
    modifiers: ["CURMODS.End_Turn.Cloak", "CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('distance gun')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/annihilator-tank.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Annihilator Tank",
    description: "Massive tank",
    type: 0,
    maxHealth: 140,
    armor: 2,
    power: 70,
    weaponType: 2,
    movement: 4,
    movementType: 2,
    range: COMMON_RANGE,
    sight: 3,
    cost: 525,
    actable: true,
    modifiers: [
      "CURMODS.Damage.Slow_Attack",
      "CURMODS.Self_Action.Repairable",
      "CURMODS.Can_Attack.Bombard"
    ],
    attackSFX: `SFXs.Retrieve('explosion')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/mortar-truck.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Mortar Truck",
    description: "Heavy distanced attack but with short range",
    type: 0,
    maxHealth: 50,
    armor: 0,
    power: 48,
    weaponType: 1,
    movement: 5,
    movementType: 1,
    range: [2, 3],
    sight: 3,
    cost: 285,
    actable: true,
    modifiers: ["CURMODS.Can_Attack.Counter_Range", "CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/rocket-truck.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Rocket Truck",
    description: "Weaker distanced attack but with long range",
    type: 0,
    maxHealth: 40,
    armor: 0,
    power: 40,
    weaponType: 2,
    movement: 6,
    movementType: 1,
    range: [3, 5],
    sight: 4,
    cost: 470,
    actable: true,
    modifiers: ["CURMODS.Can_Attack.Counter_Range", "CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('explosion')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/jammer-truck.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Jammer Truck",
    description: "Stops air units from entering jammed area and uncloaks hidden units",
    type: 0,
    maxHealth: 50,
    armor: 0,
    power: 0,
    weaponType: -1,
    movement: 5,
    movementType: 1,
    range: [],
    // enemies attacked will be partially disabled
    sight: 2,
    cost: 300,
    actable: true,
    modifiers: ["CURMODS.Move.Radar", "CURMODS.Idle.Jamming", "CURMODS.Self_Action.Repairable"],
    attackSFX: null,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/warmachine.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Warmachine",
    description: "Creates other units",
    type: 0,
    maxHealth: 75,
    armor: 1,
    power: 60,
    weaponType: 2,
    movement: 3,
    movementType: 2,
    range: [2, 3],
    sight: 3,
    cost: 525,
    Cash: 2e3,
    actable: true,
    modifiers: [
      "CURMODS.Self_Action.Miner",
      "CURMODS.Self_Action.Builder",
      "CURMODS.Self_Action.Repairable",
      "CURMODS.Death.Insta_Lose"
    ],
    attackSFX: `SFXs.Retrieve('explosion')`,
    moveSFX: `SFXs.Retrieve('car engine')`
  },
  {
    url: "game/play/units/idle/intrepid.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Intrepid",
    description: "Can capture sea buildings",
    type: 2,
    maxHealth: 50,
    armor: 0,
    power: 15,
    weaponType: 0,
    movement: 6,
    movementType: 6,
    rlow: false,
    sange: COMMON_RANGE,
    cost: 200,
    actable: true,
    modifiers: [
      "CURMODS.Start_Turn.Capture",
      "CURMODS.Move.Tracking",
      "CURMODS.Self_Action.Repairable"
    ],
    attackSFX: `SFXs.Retrieve('machine gun')`,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/corvette.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Corvette",
    description: "Basic sea unit",
    type: 2,
    maxHealth: 90,
    armor: 1,
    power: 45,
    weaponType: 1,
    movement: 5,
    movementType: 8,
    range: COMMON_RANGE,
    sight: 4,
    cost: 500,
    actable: true,
    modifiers: ["CURMODS.Can_Attack.Ground_Assult", "CURMODS.Damage.Fast_Attack"],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/hunter-support.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Hunter Support",
    description: "Can attack air units",
    type: 2,
    maxHealth: 90,
    armor: 1,
    power: 17,
    weaponType: 0,
    movement: 5,
    movementType: 6,
    range: COMMON_RANGE,
    sight: 4,
    cost: 450,
    actable: true,
    modifiers: [
      "CURMODS.Can_Attack.Air_Raid",
      "CURMODS.Damage.Flak",
      "CURMODS.Move.Tracking",
      "CURMODS.Self_Action.Repairable"
    ],
    attackSFX: `SFXs.Retrieve('machine gun')`,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/u-boat.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "U-Boat",
    description: "Can hide underwater",
    type: 2,
    maxHealth: 25,
    armor: 0,
    power: 35,
    weaponType: 2,
    movement: 4,
    movementType: 7,
    range: COMMON_RANGE,
    sight: 4,
    cost: 475,
    actable: true,
    modifiers: ["CURMODS.End_Turn.Cloak", "CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/raptor-fighter.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Raptor Fighter",
    description: "Basic air unit",
    type: 1,
    maxHealth: 50,
    armor: 0,
    power: 25,
    weaponType: 0,
    movement: 8,
    movementType: 4,
    range: COMMON_RANGE,
    sight: 5,
    cost: 235,
    actable: true,
    modifiers: ["CURMODS.Can_Attack.Air_Raid", "CURMODS.Self_Action.Irreparable"],
    attackSFX: `SFXs.Retrieve('machine gun')`,
    moveSFX: `SFXs.Retrieve('jet')`
  },
  {
    url: "game/play/units/idle/condor-bomber.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Condor Bomber",
    description: "Drops bombs of massive damage",
    type: 1,
    maxHealth: 40,
    armor: 1,
    power: 70,
    weaponType: 2,
    movement: 4,
    movementType: 4,
    range: COMMON_RANGE,
    sight: 3,
    cost: 600,
    actable: true,
    modifiers: ["CURMODS.Self_Action.Repairable", "CURMODS.Can_Attack.Bombard"],
    attackSFX: `SFXs.Retrieve('explosion')`,
    moveSFX: `SFXs.Retrieve('air')`
  },
  {
    url: "game/play/units/idle/vulture-drone.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Vulture Drone",
    description: "Can move again if attack kills",
    type: 1,
    maxHealth: 55,
    armor: 1,
    power: 30,
    weaponType: 1,
    movement: 5,
    movementType: 3,
    range: COMMON_RANGE,
    sight: 5,
    cost: 550,
    actable: true,
    modifiers: [
      "CURMODS.End_Turn.Vulture",
      "CURMODS.Self_Action.Repairable",
      "CURMODS.Can_Attack.Bombard"
    ],
    attackSFX: `SFXs.Retrieve('distance gun')`,
    moveSFX: `SFXs.Retrieve('jet')`
  },
  {
    url: "game/play/units/idle/turret.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Turret",
    description: "Basic turret unit",
    type: 0,
    maxHealth: 100,
    armor: 1,
    power: 40,
    weaponType: 1,
    movement: 0,
    movementType: 9,
    range: [2, 5],
    sight: 5,
    cost: 0,
    actable: true,
    modifiers: ["CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('distance gun')`,
    moveSFX: `SFXs.Retrieve('quite')`
  },
  {
    url: "game/play/units/idle/blockade.png",
    frames: 4,
    yOffset: 0,
    xOffset: 0,
    name: "Blockade",
    description: "Cannot move or attack, but enemies cannot cross",
    type: 0,
    maxHealth: 70,
    armor: 1,
    power: 0,
    weaponType: 0,
    movement: 0,
    movementType: 9,
    range: [0, 0],
    sight: 0,
    cost: 0,
    actable: false,
    modifiers: ["CURMODS.Self_Action.Irreparable"],
    attackSFX: null,
    moveSFX: `SFXs.Retrieve('quite')`
  },
  {
    url: "game/play/units/idle/battle-cruiser.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Battle Cruiser",
    description: "Can attack from the farthest distance in the game",
    type: 2,
    maxHealth: 140,
    armor: 2,
    power: 55,
    weaponType: 2,
    movement: 4,
    movementType: 8,
    range: [2, 6],
    sight: 6,
    cost: 800,
    actable: true,
    modifiers: ["CURMODS.Self_Action.Repairable"],
    attackSFX: `SFXs.Retrieve('big gun')`,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/leviathan.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Leviathan",
    description: "Can ship across water",
    type: 2,
    maxHealth: 60,
    armor: 1,
    power: 0,
    weaponType: 2,
    movement: 4,
    movementType: 7,
    range: COMMON_RANGE,
    sight: 2,
    cost: 0,
    actable: true,
    modifiers: ["CURMODS.Self_Action.Land", "CURMODS.Self_Action.Repairable"],
    attackSFX: null,
    moveSFX: `SFXs.Retrieve('boat')`
  },
  {
    url: "game/play/units/idle/transporter.png",
    frames: 4,
    yOffset: 60,
    xOffset: 0,
    name: "Transporter",
    description: "Can transport a non-air unit through the air",
    type: 1,
    maxHealth: 50,
    armor: 0,
    power: 0,
    weaponType: 0,
    movement: 6,
    movementType: 3,
    range: [0, 0],
    sight: 3,
    cost: 0,
    actable: true,
    modifiers: ["CURMODS.Self_Action.Land", "CURMODS.Self_Action.Repairable"],
    attackSFX: null,
    moveSFX: `SFXs.Retrieve('air')`
  }
];
const createImageLoader = (finished) => {
  const [startLoad, loaded] = ((finished2) => {
    let images = 0;
    let loadedCount = 0;
    const isFinished = (action) => {
      action();
      finished2(loadedCount === images);
    };
    return [
      () => isFinished(() => images++),
      (signalLoaded) => () => isFinished(() => {
        loadedCount++;
        signalLoaded();
      })
    ];
  })(finished);
  return (url) => (signalLoaded) => {
    startLoad();
    fetch(url).then((response) => response.blob()).then((blob) => {
      const image = new Image();
      image.src = URL.createObjectURL(blob);
      image.onload = loaded(() => signalLoaded(image));
    }).catch((error) => {
      console.error("Error fetching image:", error);
    });
  };
};
const PUBLIC_URL = "http://127.0.0.1:5173/";
const PUBLIC_GAME_NAME = "ThunderLite Local";
const desiredFrames = 60;
const millisecondsPerSecond = 1e3;
let running = [];
let counter = 1;
({
  /**
   * A requestAnimationFrame wrapper / polyfill.
   *
   * @param callback {Function} The callback to be invoked before the next repaint.
   * @param root {HTMLElement} The root element for the repaint
   */
  requestAnimationFrame: function() {
    const requestFrame = typeof window !== "undefined" ? window.requestAnimationFrame : () => {
    };
    let isNative = !!requestFrame;
    if (requestFrame && !/requestAnimationFrame\(\)\s*\{\s*\[native code\]\s*\}/i.test(requestFrame.toString())) {
      isNative = false;
    }
    if (isNative) {
      return function(callback) {
        requestFrame(callback);
      };
    }
    const TARGET_FPS = 60;
    let requests = {};
    let rafHandle = 1;
    let intervalHandle = null;
    let lastActive = performance.now();
    return function(callback) {
      const callbackHandle = rafHandle++;
      requests[callbackHandle] = callback;
      if (intervalHandle === null) {
        intervalHandle = setInterval(function() {
          const time = performance.now();
          const currentRequests = requests;
          requests = {};
          for (const key in currentRequests) {
            if (currentRequests[key]) {
              currentRequests[key](time);
              lastActive = time;
            }
          }
          if (time - lastActive > 2500 && intervalHandle) {
            clearInterval(intervalHandle);
            intervalHandle = null;
          }
        }, 1e3 / TARGET_FPS);
      }
      return callbackHandle;
    };
  }(),
  /**
   * Stops the given animation.
   *
   * @param id {Integer} Unique animation ID
   * @return {Boolean} Whether the animation was stopped (aka, was running before)
   */
  stop: function(id) {
    const cleared = running[id] !== null;
    if (cleared) {
      running[id] = null;
    }
    return cleared;
  },
  /**
   * Whether the given animation is still running.
   *
   * @param id {Integer} Unique animation ID
   * @return {Boolean} Whether the animation is still running
   */
  isRunning: function(id) {
    return running[id] != null;
  },
  /**
   * Start the animation.
   *
   * @param stepCallback {Function} Pointer to function which is executed on every step.
   *   Signature of the method should be `function(percent, now, virtual) { return continueWithAnimation; }`
   * @param verifyCallback {Function} Executed before every animation step.
   *   Signature of the method should be `function() { return continueWithAnimation; }`
   * @param completedCallback {Function}
   *   Signature of the method should be `function(droppedFrames, finishedAnimation) {}`
   * @param duration {Integer} Milliseconds to run the animation
   * @param easingMethod {Function} Pointer to easing function
   *   Signature of the method should be `function(percent) { return modifiedValue; }`
   * @param root {Element ? document.body} Render root, when available. Used for internal
   *   usage of requestAnimationFrame.
   * @return {Integer} Identifier of animation. Can be used to stop it any time.
   */
  start: function(stepCallback, verifyCallback, completedCallback, duration, easingMethod, root) {
    const start = performance.now();
    let lastFrame = start;
    let percent = 0;
    let dropCounter = 0;
    const id = counter++;
    if (id % 20 === 0) {
      const newRunning = [];
      for (const usedId in running) {
        newRunning[usedId] = true;
      }
      running = newRunning;
    }
    const step = (render) => (now) => {
      if (!running[id] || verifyCallback && !verifyCallback(id)) {
        running[id] = null;
        completedCallback && completedCallback(
          desiredFrames - dropCounter / ((now - start) / millisecondsPerSecond),
          id
        );
        return;
      }
      if (render) {
        const droppedFrames = Math.round((now - lastFrame) / (millisecondsPerSecond / desiredFrames)) - 1;
        for (let j = 0; j < Math.min(droppedFrames, 4); j++) {
          virtual();
          dropCounter++;
        }
      }
      if (duration) {
        percent = (now - start) / duration;
        if (percent > 1) {
          percent = 1;
        }
      }
      const value = easingMethod ? easingMethod(percent) : percent;
      if ((stepCallback(value, now, render) === false || percent === 1) && render) {
        running[id] = null;
        completedCallback && completedCallback(
          desiredFrames - dropCounter / ((now - start) / millisecondsPerSecond),
          id
        );
      } else if (render) {
        lastFrame = now;
        this.requestAnimationFrame(step(true));
      }
    };
    const virtual = () => {
      step(false)(performance.now());
    };
    running[id] = true;
    this.requestAnimationFrame(step(true));
    return id;
  }
});
const animationFrame = writable(0);
const animationTimer = writable();
const Scroller = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $$unsubscribe_animationFrame;
  $$unsubscribe_animationFrame = subscribe(animationFrame, (value) => value);
  let { tileWidth } = $$props;
  let { tileHeight } = $$props;
  let { contentWidth } = $$props;
  let { contentHeight } = $$props;
  let { requestRedraw = 0 } = $$props;
  let { handleClick } = $$props;
  let { handleHover } = $$props;
  let { handleOffset } = $$props;
  let { handleKeypress } = $$props;
  let container;
  let content;
  let { paint: paint2 = (context2) => (row, col, left2, top, width, height, zoom) => {
    context2.save();
    context2.translate(left2, top);
    context2.fillStyle = row % 2 + col % 2 > 0 ? "#ddd" : "#fff";
    context2.fillRect(0, 0, width, height);
    context2.fillStyle = "black";
    context2.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    context2.fillText(`${row}, ${col}`, 6 * zoom, 18 * zoom);
    context2.restore();
  } } = $$props;
  if ($$props.tileWidth === void 0 && $$bindings.tileWidth && tileWidth !== void 0)
    $$bindings.tileWidth(tileWidth);
  if ($$props.tileHeight === void 0 && $$bindings.tileHeight && tileHeight !== void 0)
    $$bindings.tileHeight(tileHeight);
  if ($$props.contentWidth === void 0 && $$bindings.contentWidth && contentWidth !== void 0)
    $$bindings.contentWidth(contentWidth);
  if ($$props.contentHeight === void 0 && $$bindings.contentHeight && contentHeight !== void 0)
    $$bindings.contentHeight(contentHeight);
  if ($$props.requestRedraw === void 0 && $$bindings.requestRedraw && requestRedraw !== void 0)
    $$bindings.requestRedraw(requestRedraw);
  if ($$props.handleClick === void 0 && $$bindings.handleClick && handleClick !== void 0)
    $$bindings.handleClick(handleClick);
  if ($$props.handleHover === void 0 && $$bindings.handleHover && handleHover !== void 0)
    $$bindings.handleHover(handleHover);
  if ($$props.handleOffset === void 0 && $$bindings.handleOffset && handleOffset !== void 0)
    $$bindings.handleOffset(handleOffset);
  if ($$props.handleKeypress === void 0 && $$bindings.handleKeypress && handleKeypress !== void 0)
    $$bindings.handleKeypress(handleKeypress);
  if ($$props.paint === void 0 && $$bindings.paint && paint2 !== void 0)
    $$bindings.paint(paint2);
  $$unsubscribe_animationFrame();
  return ` <section role="grid" tabindex="0" class="h-full outline-none"${add_attribute("this", container, 0)}><canvas${add_attribute("this", content, 0)}></canvas></section>`;
});
const TileSelector = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let selectedStyles;
  let hoveredStyles;
  let { interfacer } = $$props;
  let { select } = $$props;
  let { validTile } = $$props;
  let { mini = false } = $$props;
  const cellWidth = mini ? 20 : 60;
  const cellHeight = cellWidth;
  const handleClick = (_x, _y) => {
    const [x, y] = [tileX(_x), tileY(_y)];
    if (!validTile(x, y))
      return;
    select(x, y);
    interfacer.selected = { x, y };
  };
  const handleHover = (_x, _y) => {
    const [x, y] = [tileX(_x), tileY(_y)];
    if (!validTile(x, y))
      return;
    interfacer.hover = { x, y };
  };
  const handleOffset = (x, y, zoom) => {
    interfacer.offset = { x, y, zoom };
  };
  const handleKeypress = (_key, _shiftKey) => {
    interfacer.key.key = _key;
    interfacer.key.shift = _shiftKey;
  };
  const tileX = (x) => Math.floor(x / cellWidth);
  const tileY = (y) => Math.floor(y / cellHeight);
  if ($$props.interfacer === void 0 && $$bindings.interfacer && interfacer !== void 0)
    $$bindings.interfacer(interfacer);
  if ($$props.select === void 0 && $$bindings.select && select !== void 0)
    $$bindings.select(select);
  if ($$props.validTile === void 0 && $$bindings.validTile && validTile !== void 0)
    $$bindings.validTile(validTile);
  if ($$props.mini === void 0 && $$bindings.mini && mini !== void 0)
    $$bindings.mini(mini);
  selectedStyles = `left: ${interfacer.selected.x * cellWidth - interfacer.offset.x}px; top: ${interfacer.selected.y * cellHeight - interfacer.offset.y}px; width: ${cellWidth}px; height: ${cellHeight}px`;
  hoveredStyles = `left: ${interfacer.hover.x * cellWidth - interfacer.offset.x}px; top: ${interfacer.hover.y * cellHeight - interfacer.offset.y}px; width: ${cellWidth}px; height: ${cellHeight}px`;
  return `<section class="grid flex-grow overflow-clip"><div class="col-start-1 row-start-1 cursor-pointer">${slots.default ? slots.default({
    handleClick,
    handleHover,
    handleKeypress,
    handleOffset,
    cellWidth,
    cellHeight
  }) : ``}</div> ${!mini ? `<div class="col-start-1 row-start-1 pointer-events-none relative"><div class="absolute border-2 border-red-500"${add_attribute("style", selectedStyles, 0)}></div> <div class="absolute bg-yellow-500 opacity-30"${add_attribute("style", hoveredStyles, 0)}></div></div>` : ``}</section>`;
});
const Game = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $rendererStore, $$unsubscribe_rendererStore;
  $$unsubscribe_rendererStore = subscribe(rendererStore, (value) => $rendererStore = value);
  let { map } = $$props;
  let { makeImage } = $$props;
  let { select = (x, y) => {
    const tile = y * map.cols + x;
    console.log(tile, x, y);
  } } = $$props;
  let validTile = (x, y) => x < map.cols && y < map.rows;
  const interfacer = (() => {
    return {
      selected: { x: -1, y: -1 },
      hover: { x: -1, y: -1 },
      offset: { x: 0, y: 0, zoom: 1 },
      key: { key: "", shift: false }
    };
  })();
  let renderData = {
    ground: (type2) => $rendererStore.ground[type2],
    unit: (type2) => typeof type2 !== "undefined" ? $rendererStore.units[type2] ?? null : null,
    sky: (type2) => typeof type2 !== "undefined" ? $rendererStore.sky[type2] ?? null : null
  };
  if ($$props.map === void 0 && $$bindings.map && map !== void 0)
    $$bindings.map(map);
  if ($$props.makeImage === void 0 && $$bindings.makeImage && makeImage !== void 0)
    $$bindings.makeImage(makeImage);
  if ($$props.select === void 0 && $$bindings.select && select !== void 0)
    $$bindings.select(select);
  $$unsubscribe_rendererStore();
  return `${slots.default ? slots.default({
    interfacer,
    select,
    validTile,
    renderData
  }) : ``}`;
});
const spriteSize = 60;
const renderObject = (render, object) => (width, height, animationFrame2) => (context) => context.drawImage(
  render.sprite[object.team ?? 0],
  object.state * (spriteSize + render.xOffset),
  animationFrame2 % render.frames * (spriteSize + render.yOffset),
  spriteSize + render.xOffset,
  spriteSize + render.yOffset,
  -render.xOffset,
  -render.yOffset,
  width + render.xOffset,
  height + render.yOffset
);
const always = (renderer, object) => renderObject(renderer(object.type), object);
const conditional = (renderer, object) => object ? renderObject(renderer(object.type), object) : null;
const paint = (renderData) => (getMap) => (context) => (row, col, left2, top, width, height) => {
  context.save();
  context.translate(left2, top);
  const map = getMap();
  const tile = row * map.cols + col;
  const frame = get_store_value(animationFrame);
  always(renderData.ground, map.layers.ground[tile])(width, height, frame)(context);
  conditional(renderData.unit, map.layers.units[tile])?.call(void 0, width, height, frame)(context);
  conditional(renderData.sky, map.layers.sky[tile])?.call(void 0, width, height, frame)(context);
  context.restore();
};
const connectionDecision = (object) => flowDecision[terrainData[object.type].connector];
const singular = (map, location) => 0;
const rollInto = (map, location) => rollDecision[left(map, location) ? "true" : "false"][up(map, location) ? "true" : "false"][right(map, location) ? "true" : "false"][down(map, location) ? "true" : "false"];
const random = (map, location) => location % 5;
const border = (map, location) => {
  const border2 = borderDecision[left(map, location, ocean) ? "true" : "false"][up(map, location, ocean) ? "true" : "false"][right(map, location, ocean) ? "true" : "false"][down(map, location, ocean) ? "true" : "false"];
  if (border2 === 0) {
    if (!up(map, location + 1, ocean)) {
      return 19;
    }
    if (!down(map, location + 1, ocean)) {
      return 18;
    }
    if (!down(map, location - 1, ocean)) {
      return 17;
    }
    if (!up(map, location - 1, ocean)) {
      return 16;
    }
  }
  return border2;
};
const bridge = (map, location) => up(map, location) || down(map, location) ? 1 : 0;
const flowDecision = [singular, rollInto, random, border, bridge];
const rollDecision = {
  true: {
    true: {
      true: {
        true: 5,
        false: 6
      },
      false: {
        true: 4,
        false: 3
      }
    },
    false: {
      true: {
        true: 8,
        false: 2
      },
      false: {
        true: 11,
        false: 1
      }
    }
  },
  false: {
    true: {
      true: {
        true: 7,
        false: 9
      },
      false: {
        true: 12,
        false: 13
      }
    },
    false: {
      true: {
        true: 10,
        false: 14
      },
      false: {
        true: 15,
        false: 0
      }
    }
  }
};
const borderDecision = {
  true: {
    true: {
      true: {
        true: 0,
        false: 4
      },
      false: {
        true: 3,
        false: 12
      }
    },
    false: {
      true: {
        true: 2,
        false: 15
      },
      false: {
        true: 5,
        false: 8
      }
    }
  },
  false: {
    true: {
      true: {
        true: 1,
        false: 13
      },
      false: {
        true: 14,
        false: 9
      }
    },
    false: {
      true: {
        true: 6,
        false: 7
      },
      false: {
        true: 10,
        false: 11
      }
    }
  }
};
const type = (map, location) => map[location].type;
const ocean = (map, location) => terrainData[map[location].type].ocean;
const up = (map, location, reader = type) => location - map.cols >= 0 && reader(map.layers.ground, location - map.cols) === reader(map.layers.ground, location);
const down = (map, location, reader = type) => location + map.cols < map.layers.ground.length && reader(map.layers.ground, location + map.cols) === reader(map.layers.ground, location);
const left = (map, location, reader = type) => location % map.cols !== 0 && reader(map.layers.ground, location - 1) === reader(map.layers.ground, location);
const right = (map, location, reader = type) => (location + 1) % map.cols !== 0 && reader(map.layers.ground, location + 1) === reader(map.layers.ground, location);
const ANIMATION_TIME = 800;
const MapRender = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $animationTimer, $$unsubscribe_animationTimer;
  $$unsubscribe_animationTimer = subscribe(animationTimer, (value) => $animationTimer = value);
  let { pause = false } = $$props;
  let { map } = $$props;
  let { makeImage } = $$props;
  let { loaded } = $$props;
  let { select } = $$props;
  let { mini = false } = $$props;
  let requestRedraw = 0;
  const inc = () => {
    if (pause) {
      set_store_value(animationTimer, $animationTimer = null, $animationTimer);
      return;
    }
    animationFrame.update((frame) => (frame + 1) % 1e5);
    set_store_value(animationTimer, $animationTimer = setTimeout(inc, ANIMATION_TIME), $animationTimer);
  };
  onDestroy(() => {
    if ($animationTimer) {
      clearTimeout($animationTimer);
    }
    set_store_value(animationTimer, $animationTimer = null, $animationTimer);
  });
  if ($$props.pause === void 0 && $$bindings.pause && pause !== void 0)
    $$bindings.pause(pause);
  if ($$props.map === void 0 && $$bindings.map && map !== void 0)
    $$bindings.map(map);
  if ($$props.makeImage === void 0 && $$bindings.makeImage && makeImage !== void 0)
    $$bindings.makeImage(makeImage);
  if ($$props.loaded === void 0 && $$bindings.loaded && loaded !== void 0)
    $$bindings.loaded(loaded);
  if ($$props.select === void 0 && $$bindings.select && select !== void 0)
    $$bindings.select(select);
  if ($$props.mini === void 0 && $$bindings.mini && mini !== void 0)
    $$bindings.mini(mini);
  {
    {
      map.layers.ground.map((object, index) => object.state = connectionDecision(object)(map, index));
      requestRedraw = performance.now();
    }
  }
  {
    {
      if (!pause && !$animationTimer) {
        set_store_value(animationTimer, $animationTimer = setTimeout(inc, ANIMATION_TIME), $animationTimer);
      }
    }
  }
  $$unsubscribe_animationTimer();
  return `${$$result.head += `<!-- HEAD_svelte-115ss56_START -->${$$result.title = `<title>${escape(PUBLIC_GAME_NAME)}</title>`, ""}<!-- HEAD_svelte-115ss56_END -->`, ""} <div class="flex gap-2 border-4 border-black h-full bg-stone-400">${validate_component(Game, "Game").$$render($$result, { map, makeImage, select }, {}, {
    default: ({ interfacer, renderData, select: select2, validTile }) => {
      return `${loaded ? `${validate_component(TileSelector, "TileSelector").$$render($$result, { mini, interfacer, select: select2, validTile }, {}, {
        default: ({ cellWidth, cellHeight, handleClick, handleHover, handleKeypress, handleOffset }) => {
          return `${validate_component(Scroller, "Scroller").$$render(
            $$result,
            {
              tileWidth: cellWidth,
              tileHeight: cellHeight,
              contentWidth: cellWidth * map.cols,
              contentHeight: cellHeight * map.rows,
              paint: paint(renderData)(() => map),
              requestRedraw,
              handleClick,
              handleHover,
              handleKeypress,
              handleOffset
            },
            {},
            {}
          )}`;
        }
      })}` : `<p data-svelte-h="svelte-qeejp2">loading...</p>`}`;
    }
  })}</div>`;
});
const mapStore = writable(null);
const loadedState = writable(false);
export {
  MapRender as M,
  PUBLIC_URL as P,
  PUBLIC_GAME_NAME as a,
  createImageLoader as c,
  loadedState as l,
  mapStore as m,
  spriteStore as s,
  terrainData as t,
  unitData as u
};
