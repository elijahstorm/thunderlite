/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project

var Mod_Class = function (index, name, act, type, _args, desc, icon, test_func) {
	if (test_func == null)
		test_func = function () {
			return true
		}
	this.Index = index
	this.Name = name
	this.Type = type
	this.Description = desc
	this.Args = _args
	this.Sprite = ERRORIMG
	this.Active = true
	this.toStr = function () {
		return 'M.' + index
	}
	this.Do = function (args) {
		if (!this.Active) return false
		if (!test_func(args)) return false
		return act(args)
	}
	this.Test = function (args) {
		return test_func(args)
	}
	this.Display_HUD = function (canvas, x, y, zoom) {
		Shape.Rectangle.Draw(canvas, (x + 27) * zoom, (y + 7) * zoom, 30 * zoom, 26 * zoom, '#ccc')
		var color = '#0F0'
		if (!this.Active) color = '#704214'
		Shape.Rectangle.Draw(canvas, (x + 29) * zoom, (y + 9) * zoom, 26 * zoom, 22 * zoom, color)

		this.Sprite.Draw(canvas, (x + 30) * zoom, (y + 10) * zoom, 24 * zoom, 20 * zoom)
	}
	this.Draw = function (canvas, x, y, w, h) {
		Shape.Rectangle.Draw(canvas, x, y, w, h, '#ccc')
		var color = '#0F0'
		if (!this.Active) color = '#704214'
		Shape.Rectangle.Draw(canvas, x + 2, y + 2, w - 4, h - 4, color)

		this.Sprite.Draw(canvas, x + 3, y + 3, w - 6, h - 6)
	}

	if (icon) {
		this.Sprite = Images.Declare('Icons/' + name + '.png', name + ' Icon')
	}
}

// search for '//check modifiers' in all docs
let CURMOD = 0
var Mod_List = {
	From_Index: function (input) {
		let DECISION = null
		let LIST = [Mod_List.Units, Mod_List.Buildings, Mod_List.Terrain, Mod_List.Weather]
		for (let l in LIST) {
			Object.keys(LIST[l]).forEach(function (type) {
				if (DECISION != null) return
				Object.keys(LIST[l][type]).forEach(function (mod) {
					if (DECISION != null) return
					if (LIST[l][type][mod].Index == input) {
						DECISION = LIST[l][type][mod]
					}
				})
			})
			if (DECISION != null) break
		}
		return DECISION
	},
	Units: {
		Idle: {
			Jamming: new Mod_Class(
				CURMOD++,
				'Jamming',
				function () {},
				'Idle',
				[''],
				'Enemy planes cannot enter and detects hidden stealth units within area'
			),
		},
		Move: {
			Tracking: new Mod_Class(
				CURMOD++,
				'Tracking',
				function () {},
				'Move',
				[''],
				'Attack a cloaked stealth unit, if ran into'
			),
			Radar: new Mod_Class(
				CURMOD++,
				'Radar',
				function () {},
				'Move',
				[''],
				'Detects stealth units at start of turn'
			),
		},
		Attack: {
			Lance: new Mod_Class(
				CURMOD++,
				'Lance',
				function (unit) {
					var lanced
					if (unit.State == 0) lanced = unit.Game.Units_Map.At(unit.X + 2, unit.Y)
					else if (unit.State == 1) lanced = unit.Game.Units_Map.At(unit.X, unit.Y - 2)
					else if (unit.State == 2) lanced = unit.Game.Units_Map.At(unit.X, unit.Y + 2)
					else if (unit.State == 3) lanced = unit.Game.Units_Map.At(unit.X - 2, unit.Y)
					if (lanced != null) unit.Attack(lanced)
				},
				'Attack',
				'current unit',
				'Can attack area directly behind the unit attacked when it initiates attack'
			),
			Stun: new Mod_Class(
				CURMOD++,
				'Stun',
				function (unit) {
					if (unit.Attacking != null) unit.Attacking.Stunned = true
				},
				'Attack',
				'current unit',
				'Enemy cannot counter attack'
			),
		},
		Death: {
			Insta_Lose: new Mod_Class(
				CURMOD++,
				'Intsa Lose',
				function (unit) {
					let player = unit.Player
					let LOSE = true
					player.For_Each_Unit(function (check) {
						// check if any instant lose units still exist
						if (unit == check) return true
						if (Char_Data.CHARS[check.Source].Modifiers.includes(Mod_List.Units.Death.Insta_Lose)) {
							LOSE = false
							return false
						}
					})
					if (!LOSE) return
					player.For_Each_Building(function (check) {
						// if any instant lose buildings still exist, don't lose
						if (check.Source == Building_Data.Get('Command Center')) {
							LOSE = false
							return false
						}
					})
					if (LOSE) player.Lose()
				},
				'Death',
				'current unit',
				'If all command units die, and player has no more command centers, instantly lose'
			),
		},
		Start_Turn: {
			Capture: new Mod_Class(
				CURMOD++,
				'Capture',
				function (unit) {
					var on_building = unit.Terrain().Building
					if (on_building == null) return false
					if (on_building.Owner == unit.Player) return false
					if (unit.Repairing()) return false
					var bonus = unit.Health / unit.Max_Health
					if (unit.Game.Units_Map.At(unit.X, unit.Y) != unit) bonus *= 0.5 // if capturing unit is being rescued, then capture speed is reduced by half
					on_building.Raid(unit, bonus * 10)
					return true
				},
				'Start Turn',
				'unit',
				'Can capture buildings'
			),
			Repair: new Mod_Class(
				CURMOD++,
				'Repair',
				function (unit) {
					unit.Hurt(-Math.round(unit.Max_Health / 4))
					if (unit.Health > unit.Max_Health) unit.Health = unit.Max_Health
					return false
				},
				'Start Turn',
				'current unit',
				"Heals self a little bit at the start of it's turn"
			),
		},
		End_Turn: {
			Vulture: new Mod_Class(
				CURMOD++,
				'Vulture',
				function (unit) {
					if (unit.Killed != null) {
						unit.Killed = null
						unit.Idle = false
						unit.Set_Active(true)
					}
				},
				'End Turn',
				'current unit',
				'Can move again if it kills an enemy unit'
			),
			Cloak: new Mod_Class(
				CURMOD++,
				'Cloak',
				function (unit) {
					var _game = unit.Game
					if (_game.Detected_By_Enemy(unit)) {
						unit.Fade(255, 15)
						return false
					}

					/// down here it's able to cloak
					if (_game.Client_Player().Team == unit.Player.Team) unit.Fade(155, 15)
					else unit.Fade(0, 15)
					return true
				},
				'End Turn',
				[''],
				'Can use cloak if not by enemy unit at end of turn'
			),
		},
		Self_Action: {
			Transport: new Mod_Class(
				CURMOD++,
				'Transport',
				function (unit) {
					var game = unit.Game
					var transport = new Characters.New(game, 'Transporter')
					transport.Alpha.Set(0)
					transport.Set_Active(true)
					transport.Rescued_Unit = unit

					transport.Health = (transport.Max_Health * unit.Health) / unit.Max_Health

					unit.Fade(0, 7, function () {
						game.Remove_Unit(unit)
						unit.Set_Active(false)
						unit.Alpha.data = 255
						unit.Hide_Animation_Display()
						game.Add_Unit(transport, unit.X, unit.Y, unit.Player.Team)
						transport.Fade(255, 15)
					})
					return true
				},
				'Self Action',
				['unit'],
				'Can move other units',
				true,
				function (unit) {
					return unit.Player.Air_Control()
				}
			),
			Ship_Out: new Mod_Class(
				CURMOD++,
				'Ship Out',
				function (unit) {
					var game = unit.Game
					var transport = new Characters.New(game, 'Loading Boat')
					transport.Alpha.Set(0)
					transport.Set_Active(true)
					transport.Rescued_Unit = unit

					transport.Health = (transport.Max_Health * unit.Health) / unit.Max_Health

					unit.Fade(0, 7, function () {
						game.Remove_Unit(unit)
						unit.Alpha.data = 255
						unit.Hide_Animation_Display()
						game.Add_Unit(transport, unit.X, unit.Y, unit.Player.Team)
						transport.Fade(255, 15)
					})
					return true
				},
				'Self Action',
				['unit'],
				'Set out for the sea!',
				true,
				function (unit) {
					return unit.Player.Sea_Control()
				}
			),
			Land: new Mod_Class(
				CURMOD++,
				'Land',
				function (transport) {
					var game = transport.Game
					var unit = transport.Rescued_Unit

					unit.Health = (unit.Max_Health * transport.Health) / transport.Max_Health

					transport.Fade(0, 7, function () {
						unit.Alpha.Set(0)
						game.Remove_Unit(transport)
						transport.Hide_Animation_Display()
						transport.Set_Active(false)
						game.Add_Unit(unit, transport.X, transport.Y, transport.Player.Team)
						unit.Fade(255, 15)
						unit.Set_Active(true)
					})
					return true
				},
				'Self Action',
				['unit'],
				'Will restore unit',
				true,
				function (transport) {
					if (transport.Rescued_Unit == null) return false
					var game = transport.Game
					if (
						transport.Rescued_Unit.Calculate_Move_Cost(
							game.Terrain_Map.At(transport.X, transport.Y)
						) > transport.Rescued_Unit.Movement
					)
						return false
					return true
				}
			),

			Builder: new Mod_Class(
				CURMOD++,
				'Builder',
				function (unit) {
					if (unit.Game.AI_Players(unit.Player)) {
						// automate decision making with AI
						console.error('Add AI Builder!')
						return
					}
					var player = unit.Player

					unit.Game.Interface.Open_Unit_Create_Menu(player, unit.Cash, function (index) {
						var choices = []
						var map = unit.Game.Terrain_Map
						var new_unit = new Characters.Char_Class(unit.Game, index)
						new_unit.Player = player

						if (unit.X != 0)
							if (unit.Game.Units_Map.At(unit.X - 1, unit.Y) == null)
								if (new_unit.Calculate_Move_Cost(map.At(unit.X - 1, unit.Y)) < 10) {
									choices.push(0)
								}
						if (unit.Y != 0)
							if (unit.Game.Units_Map.At(unit.X, unit.Y - 1) == null)
								if (new_unit.Calculate_Move_Cost(map.At(unit.X, unit.Y - 1)) < 10) {
									choices.push(1)
								}
						if (unit.X != map.Width - 1)
							if (unit.Game.Units_Map.At(unit.X + 1, unit.Y) == null)
								if (new_unit.Calculate_Move_Cost(map.At(unit.X + 1, unit.Y)) < 10) {
									choices.push(2)
								}
						if (unit.Y != map.Height - 1)
							if (unit.Game.Units_Map.At(unit.X, unit.Y + 1) == null)
								if (new_unit.Calculate_Move_Cost(map.At(unit.X, unit.Y + 1)) < 10) {
									choices.push(3)
								}
						INTERFACE.Open_Unit_Direction_Choice(unit, choices, function (direction) {
							if (direction == null) {
								// user cancelled
								return
							}
							if (direction == -1) {
								// cannot build in that area
								LOG.popup('That unit cannot be built here', '#f00', 2500)
								return
							}

							var loc_x = unit.X
							var loc_y = unit.Y
							if (direction == 0) {
								// create to the left
								loc_x--
							} else if (direction == 1) {
								// create up
								loc_y--
							} else if (direction == 2) {
								// create to the right
								loc_x++
							} else if (direction == 3) {
								// create down
								loc_y++
							} else return

							unit.Game.Send_Move('send build', unit.Index, index, direction)
							SFXs.Retrieve('build').Play()
							unit.Cash -= player.Calculate_Cost(index)
							new_unit.Alpha.data = 0
							new_unit.Idle = true
							new_unit.Set_Active(false)
							unit.Game.Add_Unit(new_unit, loc_x, loc_y, player.Team)
							unit.End_Turn()
							new_unit.Fade(255, 7)
						})
					})
				},
				'Self Action',
				[''],
				'Can build other units',
				true
			),
			Miner: new Mod_Class(
				CURMOD++,
				'Miner',
				function (unit) {
					unit.Player.data.money_gained += 500
					unit.Cash += 500
					unit.End_Turn()

					var Map = unit.Game.Terrain_Map
					var x = unit.X,
						y = unit.Y
					var index = Map.At(x, y).Source + 1 // make this areas resources go down
					var new_ter = new Terrain.Terre_Class(
						unit.Game,
						index,
						'Terrain(' + x + ',' + y + ')',
						x,
						y,
						Terrain_Data.Connnection_Decision(index, unit.Game.map_source_data, x, y)
					)

					Map.Set(x, y, new_ter)

					if (Map.At(x, y).Hidden) return
					unit.Game.Interface.Income_Draw(unit.X, unit.Y, 500)
				},
				'Self Action',
				[''],
				'Can mine ore',
				true,
				function (unit) {
					var ground = unit.Game.Terrain_Map.At(unit.X, unit.Y).Source
					var mine = Terrain_Data.Get('Ore Deposit')
					return ground == mine || ground == mine - 1
				}
			),

			Repairable: new Mod_Class(
				CURMOD++,
				'Repairable',
				function (unit) {
					unit.Repair()
				},
				'Self Action',
				[''],
				'Spend turn fixing this unit for 25% health',
				true,
				function (unit) {
					if (unit.Health == unit.Max_Health) return false
					return true
				}
			),
			Irreparable: new Mod_Class(
				CURMOD++,
				'Irreparable',
				function (unit) {},
				'Self Action',
				[''],
				'Cannot repair unit--better look for a heal zone',
				false,
				function (unit) {
					return false
				}
			),
		},
		Can_Attack: {
			Counter_Range: new Mod_Class(
				CURMOD++,
				'Counter Range',
				function (args) {},
				'Can Attack',
				['attacker', 'defender'],
				'Can counter ranged attacks'
			),
			Air_Raid: new Mod_Class(
				CURMOD++,
				'Air Raid',
				function (args) {
					if (args[1].Unit_Type == 1) return true
				},
				'Can Attack',
				['attacker', 'defender'],
				'Can attack air units'
			),
			Bombard: new Mod_Class(
				CURMOD++,
				'Bombard',
				function (args) {
					if (args[1].Unit_Type == 2) return true
				},
				'Can Attack',
				['attacker', 'defender'],
				'Can attack sea units'
			),
			Ground_Assult: new Mod_Class(
				CURMOD++,
				'Ground Assult',
				function (args) {
					if (args[1].Unit_Type == 0) return true
				},
				'Can Attack',
				['attacker', 'defender'],
				'Sea unit that can attack ground units'
			),
		},
		Damage: {
			Flak: new Mod_Class(
				CURMOD++,
				'Flak',
				function (args) {
					if (args[1].Armor == 0) return 2
					return 1
				},
				'Damage',
				['attacker', ['attacker', 'defender']],
				'Deals 2x damage to light units'
			),
			Fast_Attack: new Mod_Class(
				CURMOD++,
				'Fast Attack',
				function (args) {
					if (args[0].Attacking == args[1]) return 1.2
					return 1
				},
				'Damage',
				['attacker', ['attacker', 'defender']],
				'20% more damage if it initializes attack'
			),
			Slow_Attack: new Mod_Class(
				CURMOD++,
				'Slow Attack',
				function (args) {
					if (args[0].Attacking != args[1]) return 0.85
					return 1
				},
				'Damage',
				['attacker', ['attacker', 'defender']],
				'15% less damage on counter attack'
			),
		},
		Path: {},
	},
	Buildings: {
		Capture: {
			Insta_Lose: new Mod_Class(
				CURMOD++,
				'Instant Lose',
				function (args) {
					if (args[0].Owner == null) return
					let player = args[0].Owner
					let LOSE = true
					player.For_Each_Building(function (check) {
						if (args[0] == check) return true
						if (check.Source == args[0].Source) {
							LOSE = false
							return false
						}
					})
					if (LOSE) player.Lose()
				},
				'Capture',
				['building', 'player capturing'],
				'If all command centers are lost, the owner automatically loses'
			),
			Insta_Win: new Mod_Class(
				CURMOD++,
				'Instant Win',
				function (args) {
					args[1].Win()
				},
				'Capture',
				['building', 'player capturing'],
				'If this building is captured, the capturing team automatically wins'
			),
			Allow_Ground: new Mod_Class(
				CURMOD++,
				'Allow Ground',
				function (args) {
					if (args[0].Owner != null) args[0].Owner.Add_Control(0, false)
					args[1].Add_Control(0, true)
				},
				'Capture',
				['building', 'player capturing'],
				'Capturing this building allows for construction of ground units'
			),
			Allow_Air: new Mod_Class(
				CURMOD++,
				'Allow Air',
				function (args) {
					if (args[0].Owner != null) args[0].Owner.Add_Control(1, false)
					args[1].Add_Control(1, true)
				},
				'Capture',
				['building', 'player capturing'],
				'Capturing this building allows for construction of air units'
			),
			Allow_Sea: new Mod_Class(
				CURMOD++,
				'Allow Sea',
				function (args) {
					if (args[0].Owner != null) args[0].Owner.Add_Control(2, false)
					args[1].Add_Control(2, true)
				},
				'Capture',
				['building', 'player capturing'],
				'Capturing this building allows for construction of sea units'
			),
		},
		Each_Turn: {
			Supply_Income: new Mod_Class(
				CURMOD++,
				'Supply Income',
				function (args) {
					args[1].Income(args[0].Importance * 12)
				},
				'Each Turn',
				['building', 'player'],
				'Gives money to the owned player each turn'
			),
		},
		Start_Turn: {
			Heal_Team: new Mod_Class(
				CURMOD++,
				'Heal Ground',
				function (unit) {
					if (unit.Move_Type == 3) return false
					if (unit.Move_Type == 4) return false
					if (unit.Move_Type == 5) return false
					unit.Health += 10
					if (unit.Health > unit.Max_Health) unit.Health = unit.Max_Health
				},
				'Start Turn',
				'unit on med center',
				'Heals units that start their turn on this building'
			),
			Heal_Air: new Mod_Class(
				CURMOD++,
				'Heal Air',
				function (unit) {
					if (unit.Move_Type == 0) return false
					if (unit.Move_Type == 1) return false
					if (unit.Move_Type == 2) return false
					unit.Health += 10
					if (unit.Health > unit.Max_Health) unit.Health = unit.Max_Health
				},
				'Start Turn',
				'unit on med center',
				'Heals units that start their turn on this building'
			),
			Heal_Sea: new Mod_Class(
				CURMOD++,
				'Heal Sea',
				function (unit) {
					if (unit.Move_Type == 0) return false
					if (unit.Move_Type == 1) return false
					if (unit.Move_Type == 2) return false
					if (unit.Move_Type == 3) return false
					if (unit.Move_Type == 4) return false
					if (unit.Move_Type == 5) return false
					unit.Health += 10
					if (unit.Health > unit.Max_Health) unit.Health = unit.Max_Health
				},
				'Start Turn',
				'unit on med center',
				'Heals units that start their turn on this building'
			),
		},
		End_Turn: {},
	},
	Terrain: {
		Properties: {
			Extra_Sight: new Mod_Class(
				CURMOD++,
				'Extra Sight',
				function (unit) {
					if (unit.Unit_Type != 0) return
					if (unit.Range[1] > 1) {
						unit.Range[1]++
						unit.Sight += 1
						unit.On_Move = function (unit, move) {
							unit.Range[1]--
							unit.Sight -= 1
							unit.On_Move = function (unit, move) {}
						}
					} else {
						// spider tanks can be good scoutes
						unit.Sight += unit.Source == 9 ? 2 : 1
						unit.On_Move = function (unit, move) {
							unit.Sight -= unit.Source == 9 ? 2 : 1
							unit.On_Move = function (unit, move) {}
						}
					}
				},
				'Properties',
				'unit',
				'Gives ranged units 1 extra sight'
			),
			Trench: new Mod_Class(
				CURMOD++,
				'Trench',
				function (unit) {
					if (unit.Unit_Type != 0) return
					unit.Trenched = true
					unit.On_Move = function (unit, move) {
						unit.Trenched = false
					}
				},
				'Properties',
				'unit',
				'Gives ranged units 1 extra sight'
			),
			Port: new Mod_Class(
				CURMOD++,
				'Port',
				function (unit) {
					if (unit.Unit_Type != 0) return
					unit.Add_Modifier(Mod_List.Units.Self_Action.Ship_Out)
					unit.On_Move = function (unit, move) {
						unit.Del_Modifier(Mod_List.Units.Self_Action.Ship_Out)
					}
				},
				'Properties',
				'unit',
				'Ground units here can ship off with shipping units'
			),
		},
	},
	Weather: {
		Properties: {
			Hidden: new Mod_Class(
				CURMOD++,
				'Hidden',
				function (tile) {},
				'Properties',
				'weather',
				'Units in clouds cannot be seen unless with a radar unit or you have a unit at the tile next to it'
			),
			Treacherous: new Mod_Class(
				CURMOD++,
				'Treacherous',
				function (tile) {},
				'Properties',
				'weather',
				'Unit passing thru will lose some health'
			),
		},
	},
}
