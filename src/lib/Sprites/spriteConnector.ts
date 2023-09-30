export const connectionDecision = (index: number, map: number[], x: number, y: number) => {
	const _map: number[][] = [[]]

	let type = Terrain_Data.TERRE[index].Connnection
	let __sprite, __img
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
										__img = Terrain_Data.TERRE[index].Sprite[5]

										return __img
									}
								__img = Terrain_Data.TERRE[index].Sprite[4]
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
								__img = Terrain_Data.TERRE[index].Sprite[4]
								__sprite = __img.Image()
								imageHolderCanvas.save()
								imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
								imageHolderCanvas.translate(-TILESIZE, 0)

								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()

								return __sprite
							}
						__img = Terrain_Data.TERRE[index].Sprite[2]

						return __img
					}
				if (y != 0)
					if (_map[x][y - 1] == index) {
						// connection to top
						if (y != _map[x].length - 1)
							if (_map[x][y + 1] == index) {
								// connection to bottom
								__img = Terrain_Data.TERRE[index].Sprite[4]

								return __img
							}
						__img = Terrain_Data.TERRE[index].Sprite[3]

						return __img
					}
				if (y != _map[x].length - 1)
					if (_map[x][y + 1] == index) {
						// connection to bottom
						__img = Terrain_Data.TERRE[index].Sprite[3]
						__sprite = __img.Image()
						imageHolderCanvas.save()
						imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
						imageHolderCanvas.translate(-TILESIZE, 0)

						__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
						__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
						imageHolderCanvas.restore()

						return __sprite
					}
				__img = Terrain_Data.TERRE[index].Sprite[1]

				return __img
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
								__img = Terrain_Data.TERRE[index].Sprite[4]
								__sprite = __img.Image()
								imageHolderCanvas.save()
								imageHolderCanvas.rotate((2 * 90 * Math.PI) / 180)
								imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()

								return __sprite
							}
						__img = Terrain_Data.TERRE[index].Sprite[3]
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
						__img = Terrain_Data.TERRE[index].Sprite[3]
						__sprite = __img.Image()
						imageHolderCanvas.save()
						imageHolderCanvas.rotate((2 * 90 * Math.PI) / 180)
						imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

						__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
						__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
						imageHolderCanvas.restore()

						return __sprite
					}
				__img = Terrain_Data.TERRE[index].Sprite[1]
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
						__img = Terrain_Data.TERRE[index].Sprite[2]
						__sprite = __img.Image()
						imageHolderCanvas.save()
						imageHolderCanvas.rotate((90 * Math.PI) / 180)
						imageHolderCanvas.translate(0, -TILESIZE)

						__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
						__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
						imageHolderCanvas.restore()

						return __sprite
					}
				__img = Terrain_Data.TERRE[index].Sprite[1]
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
				__img = Terrain_Data.TERRE[index].Sprite[1]

				__sprite = __img.Image()
				imageHolderCanvas.save()
				imageHolderCanvas.rotate((3 * 90 * Math.PI) / 180)
				imageHolderCanvas.translate(-TILESIZE, 0)

				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
				imageHolderCanvas.restore()

				return __sprite
			}
		__img = Terrain_Data.TERRE[index].Sprite[0]

		return __img
	}

	if (type == 2) {
		// random
		__img = Terrain_Data.TERRE[index].Sprite[Math.floor(Math.random() * 4)]
		// __sprite = __img.Image();
		// __img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
		// __sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
		return __img
	}
	if (type == 3) {
		// sea border and animation
		__sprite = null
		let sea_index = Terrain_Data.Get('Sea')
		// let type = Terrain_Data.TERRE[index].Type;
		type = Terrain_Data.TERRE[sea_index].Type
		let connector = 8
		let __ANIMATION = Animations.Retrieve(Terrain_Data.TERRE[index].Name + ' Ani')

		/// check if corner add here

		if (x != 0)
			if (y != 0)
				if (Terrain_Data.TERRE[_map[x - 1][y - 1]].Type != connector)
					if (Terrain_Data.TERRE[_map[x - 1][y - 1]].Type != type)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type == type)
							if (Terrain_Data.TERRE[_map[x - 1][y]].Type == type) {
								// top left
								__img = Terrain_Data.TERRE[index].Borders[4]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							}
		if (x != 0)
			if (y != _map[x].length - 1)
				if (Terrain_Data.TERRE[_map[x - 1][y + 1]].Type != connector)
					if (Terrain_Data.TERRE[_map[x - 1][y + 1]].Type != type)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type == type)
							if (Terrain_Data.TERRE[_map[x - 1][y]].Type == type) {
								// bottom left
								__img = Terrain_Data.TERRE[index].Borders[5]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							}
		if (x != _map.length - 1)
			if (y != 0)
				if (Terrain_Data.TERRE[_map[x + 1][y - 1]].Type != connector)
					if (Terrain_Data.TERRE[_map[x + 1][y - 1]].Type != type)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type == type)
							if (Terrain_Data.TERRE[_map[x + 1][y]].Type == type) {
								// top right
								__img = Terrain_Data.TERRE[index].Borders[4]
								imageHolderCanvas.save()
								imageHolderCanvas.scale(-1, 1)
								imageHolderCanvas.translate(-TILESIZE, 0)
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()
							}
		if (x != _map.length - 1)
			if (y != _map[x].length - 1)
				if (Terrain_Data.TERRE[_map[x + 1][y + 1]].Type != connector)
					if (Terrain_Data.TERRE[_map[x + 1][y + 1]].Type != type)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type == type)
							if (Terrain_Data.TERRE[_map[x + 1][y]].Type == type) {
								// bottom right
								__img = Terrain_Data.TERRE[index].Borders[5]
								imageHolderCanvas.save()
								imageHolderCanvas.scale(-1, 1)
								imageHolderCanvas.translate(-TILESIZE, 0)
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()
							}

		let cornerImg = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)

		if (x != 0)
			if (Terrain_Data.TERRE[_map[x - 1][y]].Type != connector)
				if (Terrain_Data.TERRE[_map[x - 1][y]].Type != type) {
					// border to left
					if (x != _map.length - 1)
						if (Terrain_Data.TERRE[_map[x + 1][y]].Type != connector)
							if (Terrain_Data.TERRE[_map[x + 1][y]].Type != type) {
								// border to right
								if (y != 0)
									if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
										if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
											// border to top
											if (y != _map[x].length - 1)
												if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
													if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
														// border to bottom
														__img = Terrain_Data.TERRE[index].Borders[9]
														__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
														__sprite = merge(
															cornerImg,
															imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
														)

														return [__ANIMATION, __sprite]
													}
											__img = Terrain_Data.TERRE[index].Borders[8]
											__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
											__sprite = merge(
												cornerImg,
												imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
											)

											return [__ANIMATION, __sprite]
										}
								if (y != _map[x].length - 1)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
										if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
											// border to bottom
											__img = Terrain_Data.TERRE[index].Borders[7]
											__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
											__sprite = merge(
												cornerImg,
												imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
											)

											return [__ANIMATION, __sprite]
										}
								__img = Terrain_Data.TERRE[index].Borders[1]
								imageHolderCanvas.save()
								imageHolderCanvas.scale(-1, 1)
								imageHolderCanvas.translate(-TILESIZE, 0)

								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								imageHolderCanvas.restore()
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)

								__sprite = merge(
									cornerImg,
									imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								)

								return [__ANIMATION, __sprite]
							}
					if (y != 0)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
							if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
								// border to top
								if (y != _map[x].length - 1)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
										if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
											// border to bottom
											__img = Terrain_Data.TERRE[index].Borders[6]
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
								__img = Terrain_Data.TERRE[index].Borders[3]
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
					if (y != _map[x].length - 1)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
							if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
								// border to bottom
								__img = Terrain_Data.TERRE[index].Borders[10]
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
					__img = Terrain_Data.TERRE[index].Borders[1]
					imageHolderCanvas.save()
					imageHolderCanvas.rotate((180 * Math.PI) / 180)
					imageHolderCanvas.translate(-TILESIZE, -TILESIZE)

					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))
					imageHolderCanvas.restore()

					return [__ANIMATION, __sprite]
				}
		if (x != _map.length - 1)
			if (Terrain_Data.TERRE[_map[x + 1][y]].Type != connector)
				if (Terrain_Data.TERRE[_map[x + 1][y]].Type != type) {
					// border to right
					if (y != 0)
						if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
							if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
								// border to top
								if (y != _map[x].length - 1)
									if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
										if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
											// border to bottom
											__img = Terrain_Data.TERRE[index].Borders[6]
											__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
											__sprite = merge(
												cornerImg,
												imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
											)

											return [__ANIMATION, __sprite]
										}
								__img = Terrain_Data.TERRE[index].Borders[3]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								__sprite = merge(
									cornerImg,
									imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								)

								return [__ANIMATION, __sprite]
							}
					if (y != _map[x].length - 1)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
							if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
								// border to bottom
								__img = Terrain_Data.TERRE[index].Borders[10]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								__sprite = merge(
									cornerImg,
									imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								)

								return [__ANIMATION, __sprite]
							}
					__img = Terrain_Data.TERRE[index].Borders[1]
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}
		if (y != 0)
			if (Terrain_Data.TERRE[_map[x][y - 1]].Type != connector)
				if (Terrain_Data.TERRE[_map[x][y - 1]].Type != type) {
					// border to top
					if (y != _map[x].length - 1)
						if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
							if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
								// border to bottom
								__img = Terrain_Data.TERRE[index].Borders[0]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								cornerImg = merge(
									cornerImg,
									imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								)
								__img = Terrain_Data.TERRE[index].Borders[2]
								__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
								__sprite = merge(
									cornerImg,
									imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
								)

								return [__ANIMATION, __sprite]
							}
					__img = Terrain_Data.TERRE[index].Borders[0]
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}
		if (y != _map[x].length - 1)
			if (Terrain_Data.TERRE[_map[x][y + 1]].Type != connector)
				if (Terrain_Data.TERRE[_map[x][y + 1]].Type != type) {
					// border to bottom
					__img = Terrain_Data.TERRE[index].Borders[2]
					__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE))

					return [__ANIMATION, __sprite]
				}

		return [__ANIMATION, cornerImg]
	}
	if (type == 4) {
		// tall terrain
		return Terrain_Data.TERRE[index].Sprite[0]
	}
	if (type == 5) {
		// animation
		let sea = Terrain_Data.TERRE[Terrain_Data.Get('Sea')]
		let type = Terrain_Data.TERRE[index].Type

		/// check if corner add here

		if (x != 0)
			if (y != 0)
				if (Terrain_Data.TERRE[_map[x - 1][y - 1]].Type != type)
					if (Terrain_Data.TERRE[_map[x][y - 1]].Type == type)
						if (Terrain_Data.TERRE[_map[x - 1][y]].Type == type) {
							// top left
							__img = sea.Borders[4]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
						}
		if (x != 0)
			if (y != _map[x].length - 1)
				if (Terrain_Data.TERRE[_map[x - 1][y + 1]].Type != type)
					if (Terrain_Data.TERRE[_map[x][y + 1]].Type == type)
						if (Terrain_Data.TERRE[_map[x - 1][y]].Type == type) {
							// bottom left
							__img = sea.Borders[5]
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
						}
		if (x != _map.length - 1)
			if (y != 0)
				if (Terrain_Data.TERRE[_map[x + 1][y - 1]].Type != type)
					if (Terrain_Data.TERRE[_map[x][y - 1]].Type == type)
						if (Terrain_Data.TERRE[_map[x + 1][y]].Type == type) {
							// top right
							__img = sea.Borders[4]
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()
						}
		if (x != _map.length - 1)
			if (y != _map[x].length - 1)
				if (Terrain_Data.TERRE[_map[x + 1][y + 1]].Type != type)
					if (Terrain_Data.TERRE[_map[x][y + 1]].Type == type)
						if (Terrain_Data.TERRE[_map[x + 1][y]].Type == type) {
							// bottom right
							__img = sea.Borders[5]
							imageHolderCanvas.save()
							imageHolderCanvas.scale(-1, 1)
							imageHolderCanvas.translate(-TILESIZE, 0)
							__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
							imageHolderCanvas.restore()
						}

		return [
			Animations.Retrieve(Terrain_Data.TERRE[index].Name + ' Ani'),
			imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE),
		]
	}
	if (type == 8) {
		// connector
		if (y != 0)
			if (Terrain_Data.TERRE[_map[x][y - 1]].Terrain == Terrain_Data.TERRE[index].Terrain) {
				// connection upwards
				__img = Terrain_Data.TERRE[index].Sprite[0]
				imageHolderCanvas.save()
				imageHolderCanvas.rotate((90 * Math.PI) / 180)
				imageHolderCanvas.translate(0, -TILESIZE)

				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
				imageHolderCanvas.restore()

				return __sprite
			}
		if (y != _map[x].length - 1)
			if (Terrain_Data.TERRE[_map[x][y + 1]].Terrain == Terrain_Data.TERRE[index].Terrain) {
				// connection downwards
				__img = Terrain_Data.TERRE[index].Sprite[0]
				imageHolderCanvas.save()
				imageHolderCanvas.rotate((90 * Math.PI) / 180)
				imageHolderCanvas.translate(0, -TILESIZE)

				__img.Draw(imageHolderCanvas, 0, 0, TILESIZE, TILESIZE)
				__sprite = imageHolderCanvas.getImageData(0, 0, TILESIZE, TILESIZE)
				imageHolderCanvas.restore()

				return __sprite
			}
		__img = Terrain_Data.TERRE[index].Sprite[0]
		return __img
	}

	// singular
	__img = Terrain_Data.TERRE[index].Sprite[0]
	return __img
}
