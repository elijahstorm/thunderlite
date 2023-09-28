/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project

/// all weather traverses thru the map
/// due to wind
/// as the match plays on
// lets start by making no wind the defult
// because this might be a more fun feature, rather than wind
// and weather should just be a tile affecting air units
// that is translucent so you can see how the ground below can also affect you

// clouds
//	units below cannot be seen
//		fog of war
//	air units can travel through but lose movement for crossing
//
// storm
//	units below cannot be seen, but lose movement traveling thru
//		fog of war
//	air units can travel through but lose extreme movement and some health for crossing

var Weather_Data = {
	WEATHER: [],
	Get_Global: function (index) {
		if (index == 1) return Weather_Data.Rain
		if (index == 2) return Weather_Data.Snow
		return null
	},
	Connnection_Images: function (type) {
		if (type == 1)
			// roll into
			return 5
		if (type == 2)
			// random
			return 4
		if (type == 3)
			// animate
			return 4
		return 1 // singular
	},
	Connnection_Decision: function (index, _map, x, y) {
		var type = Weather_Data.WEATHER[index].Connnection
		var __sprite, __img
		imageHolderCanvas.clearRect(0, 0, imageHolderCanvas.width, imageHolderCanvas.height)
		imageHolderCanvas.restore()

		if (type == 1) {
			// roll into
			if (x != 0)
				if (_map[x - 1][y] == index) {
					// connection to left
					if (x != _map.length - 1)
						if (_map[x + 1][y] == index) {
							// connection to right
							if (y != 0)
								if (_map[x][y - 1] == index) {
									// connection to top
									if (y != _map[x].length - 1)
										if (_map[x][y + 1] == index) {
											// connection to bottom
											__img = Weather_Data.WEATHER[index].Sprite[5]
											__sprite = __img.Image()
											__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
											__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

											return __sprite
										}
									__img = Weather_Data.WEATHER[index].Sprite[4]
									__sprite = __img.Image()
									imageHolderCanvas.save()
									imageHolderCanvas.rotate((90 * Math.PI) / 180)
									imageHolderCanvas.translate(0, -TILESIZE)

									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									imageHolderCanvas.restore()

									return __sprite
								}
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] == index) {
									// connection to bottom
									__img = Weather_Data.WEATHER[index].Sprite[4]
									__sprite = __img.Image()
									imageHolderCanvas.save()
									imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
									imageHolderCanvas.translate(-TILESIZE, 0)

									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									imageHolderCanvas.restore()

									return __sprite
								}
							__img = Weather_Data.WEATHER[index].Sprite[2]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

							return __sprite
						}
					if (y != 0)
						if (_map[x][y - 1] == index) {
							// connection to top
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] == index) {
									// connection to bottom
									__img = Weather_Data.WEATHER[index].Sprite[4]
									__sprite = __img.Image()
									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

									return __sprite
								}
							__img = Weather_Data.WEATHER[index].Sprite[3]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

							return __sprite
						}
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] == index) {
							// connection to bottom
							__img = Weather_Data.WEATHER[index].Sprite[3]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()

							return __sprite
						}
					__img = Weather_Data.WEATHER[index].Sprite[1]
					__sprite = __img.Image()
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

					return __sprite
				}
			if (x != _map.length - 1)
				if (_map[x + 1][y] == index) {
					// connection to right
					if (y != 0)
						if (_map[x][y - 1] == index) {
							// connection to top
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] == index) {
									// connection to bottom
									__img = Weather_Data.WEATHER[index].Sprite[4]
									__sprite = __img.Image()
									imageHolderCanvas.save()
									imageHolderCanvas.rotate((2 * 90 * Math.PI) / 180)
									imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									imageHolderCanvas.restore()

									return __sprite
								}
							__img = Weather_Data.WEATHER[index].Sprite[3]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.rotate((90 * Math.PI) / 180)
							imageHolderCanvas.translate(0, -TILESIZE)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()

							return __sprite
						}
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] == index) {
							// connection to bottom
							__img = Weather_Data.WEATHER[index].Sprite[3]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.rotate((2 * 90 * Math.PI) / 180)
							imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()

							return __sprite
						}
					__img = Weather_Data.WEATHER[index].Sprite[1]
					__sprite = __img.Image()
					imageHolderCanvas.save()
					imageHolderCanvas.rotate((2 * 90 * Math.PI) / 180)
					imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
					imageHolderCanvas.restore()

					return __sprite
				}
			if (y != 0)
				if (_map[x][y - 1] == index) {
					// connection to top
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] == index) {
							// connection to bottom
							__img = Weather_Data.WEATHER[index].Sprite[2]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.rotate((90 * Math.PI) / 180)
							imageHolderCanvas.translate(0, -TILESIZE)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()

							return __sprite
						}
					__img = Weather_Data.WEATHER[index].Sprite[1]
					__sprite = __img.Image()
					imageHolderCanvas.save()
					imageHolderCanvas.rotate((90 * Math.PI) / 180)
					imageHolderCanvas.translate(0, -TILESIZE)

					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
					imageHolderCanvas.restore()

					return __sprite
				}
			if (y != _map[x].length - 1)
				if (_map[x][y + 1] == index) {
					// connection to bottom
					__img = Weather_Data.WEATHER[index].Sprite[1]
					__sprite = __img.Image()
					imageHolderCanvas.save()
					imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
					imageHolderCanvas.translate(-TILESIZE, 0)

					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
					imageHolderCanvas.restore()

					return __sprite
				}
			__img = Weather_Data.WEATHER[index].Sprite[0]
			__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
			__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
			return __sprite
		}
		if (type == 2) {
			// random
			__img = Weather_Data.WEATHER[index].Sprite[Math.floor(Math.random() * 4)]
			__sprite = __img.Image()
			__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
			__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
			return __sprite
		}
		if (type == 3) {
			// border and animation
			__sprite = null
			var __ANIMATION = Animations.Retrieve('Sea Ani')

			/// check if corner add here

			if (x != 0)
				if (y != 0)
					if (_map[x - 1][y - 1] != index)
						if (_map[x][y - 1] == index)
							if (_map[x - 1][y] == index) {
								// top left
								__img = Weather_Data.WEATHER[index].Borders[4]
								__sprite = __img.Image()
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							}
			if (x != 0)
				if (y != _map[x].length - 1)
					if (_map[x - 1][y + 1] != index)
						if (_map[x][y + 1] == index)
							if (_map[x - 1][y] == index) {
								// bottom left
								__img = Weather_Data.WEATHER[index].Borders[5]
								__sprite = __img.Image()
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							}
			if (x != _map.length - 1)
				if (y != 0)
					if (_map[x + 1][y - 1] != index)
						if (_map[x][y - 1] == index)
							if (_map[x + 1][y] == index) {
								// top right
								__img = Weather_Data.WEATHER[index].Borders[4]
								__sprite = __img.Image()
								imageHolderCanvas.save()
								imageHolderCanvas.scale(-1, 1)
								imageHolderCanvas.translate(-TILESIZE, 0)
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()
							}
			if (x != _map.length - 1)
				if (y != _map[x].length - 1)
					if (_map[x + 1][y + 1] != index)
						if (_map[x][y + 1] == index)
							if (_map[x + 1][y] == index) {
								// bottom right
								__img = Weather_Data.WEATHER[index].Borders[5]
								__sprite = __img.Image()
								imageHolderCanvas.save()
								imageHolderCanvas.scale(-1, 1)
								imageHolderCanvas.translate(-TILESIZE, 0)
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()
							}

			var cornerImg = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
			__sprite = cornerImg

			if (x != 0)
				if (_map[x - 1][y] != index) {
					// border to left
					if (x != _map.length - 1)
						if (_map[x + 1][y] != index) {
							// border to right
							if (y != 0)
								if (_map[x][y - 1] != index) {
									// border to top
									if (y != _map[x].length - 1)
										if (_map[x][y + 1] != index) {
											// border to bottom
											__img = Weather_Data.WEATHER[index].Borders[9]
											__sprite = __img.Image()
											__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
											__sprite = merge(
												cornerImg,
												imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
											)

											return [__ANIMATION, __sprite]
										}
									__img = Weather_Data.WEATHER[index].Borders[8]
									__sprite = __img.Image()
									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = merge(
										cornerImg,
										imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									)

									return [__ANIMATION, __sprite]
								}
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] != index) {
									// border to bottom
									__img = Weather_Data.WEATHER[index].Borders[7]
									__sprite = __img.Image()
									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = merge(
										cornerImg,
										imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									)

									return [__ANIMATION, __sprite]
								}
							__img = Weather_Data.WEATHER[index].Borders[1]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)

							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
					if (y != 0)
						if (_map[x][y - 1] != index) {
							// border to top
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] != index) {
									// border to bottom
									__img = Weather_Data.WEATHER[index].Borders[6]
									__sprite = __img.Image()
									imageHolderCanvas.save()
									imageHolderCanvas.scale(-1, 1)
									imageHolderCanvas.translate(-TILESIZE, 0)

									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = merge(
										cornerImg,
										imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									)
									imageHolderCanvas.restore()

									return [__ANIMATION, __sprite]
								}
							__img = Weather_Data.WEATHER[index].Borders[3]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							imageHolderCanvas.restore()

							return [__ANIMATION, __sprite]
						}
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] != index) {
							// border to bottom
							__img = Weather_Data.WEATHER[index].Borders[10]
							__sprite = __img.Image()
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)

							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							imageHolderCanvas.restore()

							return [__ANIMATION, __sprite]
						}
					__img = Weather_Data.WEATHER[index].Borders[1]
					__sprite = __img.Image()
					imageHolderCanvas.save()
					imageHolderCanvas.rotate((180 * Math.PI) / 180)
					imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
					imageHolderCanvas.restore()

					return [__ANIMATION, __sprite]
				}
			if (x != _map.length - 1)
				if (_map[x + 1][y] != index) {
					// border to right
					if (y != 0)
						if (_map[x][y - 1] != index) {
							// border to top
							if (y != _map[x].length - 1)
								if (_map[x][y + 1] != index) {
									// border to bottom
									__img = Weather_Data.WEATHER[index].Borders[6]
									__sprite = __img.Image()
									__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
									__sprite = merge(
										cornerImg,
										imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
									)

									return [__ANIMATION, __sprite]
								}
							__img = Weather_Data.WEATHER[index].Borders[3]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] != index) {
							// border to bottom
							__img = Weather_Data.WEATHER[index].Borders[10]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
					__img = Weather_Data.WEATHER[index].Borders[1]
					__sprite = __img.Image()
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}
			if (y != 0)
				if (_map[x][y - 1] != index) {
					// border to top
					if (y != _map[x].length - 1)
						if (_map[x][y + 1] != index) {
							// border to bottom
							__img = Weather_Data.WEATHER[index].Borders[0]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
							__img = Weather_Data.WEATHER[index].Borders[2]
							__sprite = __img.Image()
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

							return [__ANIMATION, __sprite]
						}
					__img = Weather_Data.WEATHER[index].Borders[0]
					__sprite = __img.Image()
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}
			if (y != _map[x].length - 1)
				if (_map[x][y + 1] != index) {
					// border to bottom
					__img = Weather_Data.WEATHER[index].Borders[2]
					__sprite = __img.Image()
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}

			return [__ANIMATION, __sprite]
		}
		if (type == 4) {
			// tall terrain
			return Weather_Data.WEATHER[index].Sprite[0]
		}

		// singular
		__img = Weather_Data.WEATHER[index].Sprite[0]
		__sprite = __img.Image()
		__img.Draw(imageHolderCanvas, 0, 0, __sprite.width, __sprite.height)
		__sprite = imageHolderCanvas.getImageData(0, 0, __sprite.width, __sprite.height)
		return __sprite
	},
	Change_Queue: [],
	Fade: function (state, tile, rate, check_dup) {
		if (check_dup)
			for (var i in Weather_Data.Change_Queue) {
				if (Weather_Data.Change_Queue[i][1] == tile) {
					Weather_Data.Change_Queue[i] = [state, tile, rate]
					return
				}
			}
		if (tile.Hidden) if (state == 'fog show') return
		if (!tile.Hidden) if (state == 'fog hide') return
		Weather_Data.Change_Queue.push([state, tile, rate])
	},
	Remove_Fade: function (tile) {
		for (var i in Weather_Data.Change_Queue) {
			if (Weather_Data.Change_Queue[i][1] == tile) {
				Weather_Data.Change_Queue.splice(i, 1)
				return
			}
		}
	},
	Execute_Change: function () {
		// fog show -> on
		// fog hide -> off
		let t
		for (var i in Weather_Data.Change_Queue) {
			t = Weather_Data.Change_Queue[i][1]
			if (Weather_Data.Change_Queue[i][0] == 'fog hide') {
				t.Alpha.data = 1
				Core.Fade_Drawable(t, 0, Weather_Data.Change_Queue[i][2], function (t) {
					t.Hidden = false
					INTERFACE.Draw()
				})
			} else if (Weather_Data.Change_Queue[i][0] == 'fog show') {
				t.Alpha.data = 0
				Core.Fade_Drawable(t, 1, Weather_Data.Change_Queue[i][2])
				t.Hidden = true
			}
		}
		Weather_Data.Change_Queue = []
	},
	Get: function (check) {
		for (var i = 0; i < Weather_Data.WEATHER.length; i++) {
			if (check == Weather_Data.WEATHER[i].Name) {
				return i
			}
		}
		return 0
	},
	Reverse_Get: function (index) {
		if (index < Weather_Data.WEATHER.length) return Weather_Data.WEATHER[index]
	},
}

var CURWTHR = 0
var CURMODS = Mod_List.Weather
Weather_Data.WEATHER[CURWTHR++] = {
	Name: 'ERROR',
	Description: 'ERROR',
	Type: 0,
	Protection: 0,
	Damage: 0,
	Height: 0,
	Drag: 0,
	Connnection: 0,
	Modifiers: [],
	Sprite: ERRORIMG,
	X: 0,
	Y: 0,
}
Weather_Data.WEATHER[CURWTHR++] = {
	Name: 'Cloud',
	Description: 'Cloud coverage',
	Type: 0,
	Damage: 0,
	Density: 0.3,
	Drag: 1,
	Connnection: 1,
	Modifiers: [CURMODS.Properties.Hidden],
	Sprite: null,
	X: 0,
	Y: 8,
}
Weather_Data.WEATHER[CURWTHR++] = {
	Name: 'Storm',
	Description: 'Treacherous, be careful!',
	Type: 1,
	Damage: 10,
	Density: 0.7,
	Drag: 2,
	Connnection: 1,
	Modifiers: [CURMODS.Properties.Hidden, CURMODS.Properties.Treacherous],
	Sprite: null,
	X: 0,
	Y: 7,
}

/** Simple set for common data */
for (var x = 1; x < Weather_Data.WEATHER.length; x++) {
	// setting sprites
	var _w = Weather_Data.WEATHER[x]

	_w.Sprite = new Array(5)
	for (var i = 0; i < _w.Sprite.length; i++) {
		_w.Sprite[i] = Images.Declare(
			'Weather/' + _w.Name + '/' + _w.Name + '' + i + '.png',
			_w.Name + i
		)
		_w.Sprite[i].Stretch(true)
	}
}
