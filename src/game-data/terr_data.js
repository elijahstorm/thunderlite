/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project


var Terrain_Data = {
	TERRE:[],
	TerrainToStr:["Ground","Air","Sea"],
	TypeToStr:["Dirty","Rough","Rugged","Clean","Hole-y","Slippery","Sea","Impassable","Connector"],
	Connnection_Images:function(type)
	{
		if(type==1) // roll into
			return 6;
		if(type==2)	// random
			return 4;
		if(type==3)	// sea and borders
			return 4;
		if(type==5)	// animate
			return 3;
		if(type==8)	// animate
			return 1;
		return 1;	// singular
	},
	Connnection_Decision:function(index, _map, x, y)
	{
		var type = Terrain_Data.TERRE[index].Connnection;
		var __sprite, __img;
		imageHolderCanvas.clearRect(0,0,imageHolderCanvas.width,imageHolderCanvas.height);
		imageHolderCanvas.restore();

		if(type==1)
		{	// roll into
			if(x!=0)
			if(_map[x-1][y]==index)
			{	// connection to left
				if(x!=_map.length-1)
				if(_map[x+1][y]==index)
				{	// connection to right
					if(y!=0)
					if(_map[x][y-1]==index)
					{	// connection to top
						if(y!=_map[x].length-1)
						if(_map[x][y+1]==index)
						{	// connection to bottom
							__img = Terrain_Data.TERRE[index].Sprite[5];

							return __img;
						}
						__img = Terrain_Data.TERRE[index].Sprite[4];
						__sprite = __img.Image();
						imageHolderCanvas.save();
						imageHolderCanvas.rotate(90*Math.PI/180);
						imageHolderCanvas.translate(0, -TILESIZE);

						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
						imageHolderCanvas.restore();

						return __sprite;
					}
					if(y!=_map[x].length-1)
					if(_map[x][y+1]==index)
					{	// connection to bottom
						__img = Terrain_Data.TERRE[index].Sprite[4];
						__sprite = __img.Image();
						imageHolderCanvas.save();
						imageHolderCanvas.rotate(3*90*Math.PI/180);
						imageHolderCanvas.translate(-TILESIZE, 0);

						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
						imageHolderCanvas.restore();

						return __sprite;
					}
					__img = Terrain_Data.TERRE[index].Sprite[2];

					return __img;
				}
				if(y!=0)
				if(_map[x][y-1]==index)
				{	// connection to top
					if(y!=_map[x].length-1)
					if(_map[x][y+1]==index)
					{	// connection to bottom
						__img = Terrain_Data.TERRE[index].Sprite[4];

						return __img;
					}
					__img = Terrain_Data.TERRE[index].Sprite[3];

					return __img;
				}
				if(y!=_map[x].length-1)
				if(_map[x][y+1]==index)
				{	// connection to bottom
					__img = Terrain_Data.TERRE[index].Sprite[3];
					__sprite = __img.Image();
					imageHolderCanvas.save();
					imageHolderCanvas.rotate(3*90*Math.PI/180);
					imageHolderCanvas.translate(-TILESIZE, 0);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
					imageHolderCanvas.restore();

					return __sprite;
				}
				__img = Terrain_Data.TERRE[index].Sprite[1];

				return __img;
			}
			if(x!=_map.length-1)
			if(_map[x+1][y]==index)
			{	// connection to right
				if(y!=0)
				if(_map[x][y-1]==index)
				{	// connection to top
					if(y!=_map[x].length-1)
					if(_map[x][y+1]==index)
					{	// connection to bottom
						__img = Terrain_Data.TERRE[index].Sprite[4];
						__sprite = __img.Image();
						imageHolderCanvas.save();
						imageHolderCanvas.rotate(2*90*Math.PI/180);
						imageHolderCanvas.translate(-TILESIZE, -TILESIZE);

						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
						imageHolderCanvas.restore();

						return __sprite;
					}
					__img = Terrain_Data.TERRE[index].Sprite[3];
					__sprite = __img.Image();
					imageHolderCanvas.save();
					imageHolderCanvas.rotate(90*Math.PI/180);
					imageHolderCanvas.translate(0, -TILESIZE);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
					imageHolderCanvas.restore();

					return __sprite;
				}
				if(y!=_map[x].length-1)
				if(_map[x][y+1]==index)
				{	// connection to bottom
					__img = Terrain_Data.TERRE[index].Sprite[3];
					__sprite = __img.Image();
					imageHolderCanvas.save();
					imageHolderCanvas.rotate(2*90*Math.PI/180);
					imageHolderCanvas.translate(-TILESIZE, -TILESIZE);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
					imageHolderCanvas.restore();

					return __sprite;
				}
				__img = Terrain_Data.TERRE[index].Sprite[1];
				__sprite = __img.Image();
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(2*90*Math.PI/180);
				imageHolderCanvas.translate(-TILESIZE, -TILESIZE);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();

				return __sprite;
			}
			if(y!=0)
			if(_map[x][y-1]==index)
			{	// connection to top
				if(y!=_map[x].length-1)
				if(_map[x][y+1]==index)
				{	// connection to bottom
					__img = Terrain_Data.TERRE[index].Sprite[2];
					__sprite = __img.Image();
					imageHolderCanvas.save();
					imageHolderCanvas.rotate(90*Math.PI/180);
					imageHolderCanvas.translate(0, -TILESIZE);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
					imageHolderCanvas.restore();

					return __sprite;
				}
				__img = Terrain_Data.TERRE[index].Sprite[1];
				__sprite = __img.Image();
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(90*Math.PI/180);
				imageHolderCanvas.translate(0, -TILESIZE);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();

				return __sprite;
			}
			if(y!=_map[x].length-1)
			if(_map[x][y+1]==index)
			{	// connection to bottom
				__img = Terrain_Data.TERRE[index].Sprite[1];

				__sprite = __img.Image();
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(3*90*Math.PI/180);
				imageHolderCanvas.translate(-TILESIZE, 0);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();

				return __sprite;
			}
			__img = Terrain_Data.TERRE[index].Sprite[0];

			return __img;
		}





		if(type==2)
		{	// random
			__img = Terrain_Data.TERRE[index].Sprite[Math.floor(Math.random()*4)];
			// __sprite = __img.Image();
			// __img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
			// __sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
			return __img;
		}
		if(type==3)
		{	// sea border and animation
			__sprite = null;
			var sea_index = Terrain_Data.Get("Sea");
			// var type = Terrain_Data.TERRE[index].Type;
			type = Terrain_Data.TERRE[sea_index].Type;
			var connector = 8;
			var __ANIMATION = Animations.Retrieve(Terrain_Data.TERRE[index].Name+" Ani");

			/// check if corner add here

			if(x!=0)
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x-1][y-1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x-1][y-1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type==type)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type==type)
			{	// top left
				__img = Terrain_Data.TERRE[index].Borders[4];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
			}
			if(x!=0)
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x-1][y+1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x-1][y+1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type==type)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type==type)
			{	// bottom left
				__img = Terrain_Data.TERRE[index].Borders[5];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
			}
			if(x!=_map.length-1)
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x+1][y-1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x+1][y-1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type==type)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type==type)
			{	// top right
				__img = Terrain_Data.TERRE[index].Borders[4];
				imageHolderCanvas.save();
				imageHolderCanvas.scale(-1, 1);
				imageHolderCanvas.translate(-TILESIZE, 0);
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();
			}
			if(x!=_map.length-1)
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x+1][y+1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x+1][y+1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type==type)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type==type)
			{	// bottom right
				__img = Terrain_Data.TERRE[index].Borders[5];
				imageHolderCanvas.save();
				imageHolderCanvas.scale(-1, 1);
				imageHolderCanvas.translate(-TILESIZE, 0);
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();
			}

			var cornerImg = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);

			if(x!=0)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type!=type)
			{	// border to left
				if(x!=_map.length-1)
				if(Terrain_Data.TERRE[_map[x+1][y]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x+1][y]].Type!=type)
				{	// border to right
					if(y!=0)
					if(Terrain_Data.TERRE[_map[x][y-1]].Type!=connector)
					if(Terrain_Data.TERRE[_map[x][y-1]].Type!=type)
					{	// border to top
						if(y!=_map[x].length-1)
						if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
						if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
						{	// border to bottom
							__img = Terrain_Data.TERRE[index].Borders[9];
							__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
							__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

							return [__ANIMATION, __sprite];
						}
						__img = Terrain_Data.TERRE[index].Borders[8];
						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

						return [__ANIMATION, __sprite];
					}
					if(y!=_map[x].length-1)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
					{	// border to bottom
						__img = Terrain_Data.TERRE[index].Borders[7];
						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

						return [__ANIMATION, __sprite];
					}
					__img = Terrain_Data.TERRE[index].Borders[1];
					imageHolderCanvas.save();
					imageHolderCanvas.scale(-1, 1);
					imageHolderCanvas.translate(-TILESIZE, 0);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					imageHolderCanvas.restore();
					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);

					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

					return [__ANIMATION, __sprite];
				}
				if(y!=0)
				if(Terrain_Data.TERRE[_map[x][y-1]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x][y-1]].Type!=type)
				{	// border to top
					if(y!=_map[x].length-1)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
					{	// border to bottom
						__img = Terrain_Data.TERRE[index].Borders[6];
						imageHolderCanvas.save();
						imageHolderCanvas.scale(-1, 1);
						imageHolderCanvas.translate(-TILESIZE, 0);

						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));
						imageHolderCanvas.restore();

						return [__ANIMATION, __sprite];
					}
					__img = Terrain_Data.TERRE[index].Borders[3];
					imageHolderCanvas.save();
					imageHolderCanvas.scale(-1, 1);
					imageHolderCanvas.translate(-TILESIZE, 0);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));
					imageHolderCanvas.restore();

					return [__ANIMATION, __sprite];
				}
				if(y!=_map[x].length-1)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
				{	// border to bottom
					__img = Terrain_Data.TERRE[index].Borders[10];
					imageHolderCanvas.save();
					imageHolderCanvas.scale(-1, 1);
					imageHolderCanvas.translate(-TILESIZE, 0);

					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));
					imageHolderCanvas.restore();

					return [__ANIMATION, __sprite];
				}
				__img = Terrain_Data.TERRE[index].Borders[1];
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(180*Math.PI/180);
				imageHolderCanvas.translate(-TILESIZE, -TILESIZE);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));
				imageHolderCanvas.restore();

				return [__ANIMATION, __sprite];
			}
			if(x!=_map.length-1)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type!=type)
			{	// border to right
				if(y!=0)
				if(Terrain_Data.TERRE[_map[x][y-1]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x][y-1]].Type!=type)
				{	// border to top
					if(y!=_map[x].length-1)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
					if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
					{	// border to bottom
						__img = Terrain_Data.TERRE[index].Borders[6];
						__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
						__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

						return [__ANIMATION, __sprite];
					}
					__img = Terrain_Data.TERRE[index].Borders[3];
					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE))

					return [__ANIMATION, __sprite];
				}
				if(y!=_map[x].length-1)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
				{	// border to bottom
					__img = Terrain_Data.TERRE[index].Borders[10];
					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE))

					return [__ANIMATION, __sprite];
				}
				__img = Terrain_Data.TERRE[index].Borders[1];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE))

				return [__ANIMATION, __sprite];
			}
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type!=type)
			{	// border to top
				if(y!=_map[x].length-1)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
				if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
				{	// border to bottom
					__img = Terrain_Data.TERRE[index].Borders[0];
					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					cornerImg = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));
					__img = Terrain_Data.TERRE[index].Borders[2];
					__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
					__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

					return [__ANIMATION, __sprite];
				}
				__img = Terrain_Data.TERRE[index].Borders[0];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

				return [__ANIMATION, __sprite];
			}
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type!=connector)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type!=type)
			{	// border to bottom
				__img = Terrain_Data.TERRE[index].Borders[2];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = merge(cornerImg, imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE));

				return [__ANIMATION, __sprite];
			}

			return [__ANIMATION, cornerImg];
		}
		if(type==4)
		{	// tall terrain
			return Terrain_Data.TERRE[index].Sprite[0];
		}
		if(type==5)
		{	// animation
			var sea = Terrain_Data.TERRE[Terrain_Data.Get("Sea")];
			var type = Terrain_Data.TERRE[index].Type;

			/// check if corner add here

			if(x!=0)
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x-1][y-1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type==type)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type==type)
			{	// top left
				__img = sea.Borders[4];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
			}
			if(x!=0)
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x-1][y+1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type==type)
			if(Terrain_Data.TERRE[_map[x-1][y]].Type==type)
			{	// bottom left
				__img = sea.Borders[5];
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
			}
			if(x!=_map.length-1)
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x+1][y-1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y-1]].Type==type)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type==type)
			{	// top right
				__img = sea.Borders[4];
				imageHolderCanvas.save();
				imageHolderCanvas.scale(-1, 1);
				imageHolderCanvas.translate(-TILESIZE, 0);
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();
			}
			if(x!=_map.length-1)
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x+1][y+1]].Type!=type)
			if(Terrain_Data.TERRE[_map[x][y+1]].Type==type)
			if(Terrain_Data.TERRE[_map[x+1][y]].Type==type)
			{	// bottom right
				__img = sea.Borders[5];
				imageHolderCanvas.save();
				imageHolderCanvas.scale(-1, 1);
				imageHolderCanvas.translate(-TILESIZE, 0);
				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();
			}

			return [Animations.Retrieve(Terrain_Data.TERRE[index].Name+" Ani"), imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE)];
		}
		if(type==8)
		{	// connector
			if(y!=0)
			if(Terrain_Data.TERRE[_map[x][y-1]].Terrain==Terrain_Data.TERRE[index].Terrain)
			{	// connection upwards
				__img = Terrain_Data.TERRE[index].Sprite[0];
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(90*Math.PI/180);
				imageHolderCanvas.translate(0, -TILESIZE);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();

				return __sprite;
			}
			if(y!=_map[x].length-1)
			if(Terrain_Data.TERRE[_map[x][y+1]].Terrain==Terrain_Data.TERRE[index].Terrain)
			{	// connection downwards
				__img = Terrain_Data.TERRE[index].Sprite[0];
				imageHolderCanvas.save();
				imageHolderCanvas.rotate(90*Math.PI/180);
				imageHolderCanvas.translate(0, -TILESIZE);

				__img.Draw(imageHolderCanvas,0,0,TILESIZE,TILESIZE);
				__sprite = imageHolderCanvas.getImageData(0,0,TILESIZE,TILESIZE);
				imageHolderCanvas.restore();

				return __sprite;
			}
			__img = Terrain_Data.TERRE[index].Sprite[0];
			return __img;
		}

			// singular
		__img = Terrain_Data.TERRE[index].Sprite[0];
		return __img;
	},
	Is_Reachable:function(terrain_type, unit_type)
	{
		if(terrain_type==6)
		if(unit_type==0)
			return false;
		if(terrain_type==7)
			return false;
		if(unit_type==2)
			return false;
		if(unit_type==-1)
			return false;
		return true;
	},
	Fog:Images.Retrieve("fog tile"),
	Get:function(check)
	{
		for(var i=0;i<Terrain_Data.TERRE.length;i++)
		{
			if(check==Terrain_Data.TERRE[i].Name)
			{
				return i;
			}
		}
		return 0;
	},
	Reverse_Get:function(index)
	{
		if(index<Terrain_Data.TERRE.length)
		return Terrain_Data.TERRE[index];
	}
};

var CURTERRE = 0;
var CURMODS = Mod_List.Terrain;
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"ERROR",
	Description:"ERROR",
	Terrain:-1,
	Type:0,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:0,
	Connnection:0,
	Modifiers:[],
	Sprite:ERRORIMG,
	X:0,
	Y:0
};

	/// ground
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Plains",
	Description:"Basic terrain",
	Terrain:0,
	Type:0,
	Protection:.1,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:2,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Hill",
	Description:"Gives ranged units an extended range",
	Terrain:0,
	Type:1,
	Protection:.2,
	Damage:0,
	Height:20,
	Drag:2,
	Connnection:2,
	Modifiers:[CURMODS.Properties.Extra_Sight],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Forest",
	Description:"Gives defense boost",
	Terrain:0,
	Type:1,
	Protection:.2,
	Damage:0,
	Height:5,
	Drag:2,
	Connnection:2,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Mountain",
	Description:"Hard to traverse but gives strong defense",
	Terrain:0,
	Type:2,
	Protection:.4,
	Damage:0,
	Height:50,
	Drag:2,
	Connnection:2,
	Modifiers:[CURMODS.Properties.Extra_Sight],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = { // index => 5
	Name:"Road",
	Description:"Easy to traverse but provides no defense",
	Terrain:0,
	Type:3,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:1,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Canyon",
	Description:"Dips down, but ranged units cannot target here",
	Terrain:0,
	Type:5,
	Protection:.3,
	Damage:0,
	Height:-10,
	Drag:1,
	Connnection:1,
	Modifiers:[CURMODS.Properties.Trench],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Wasteland",
	Description:"Provides lots of defense, but costs health to rest on",
	Terrain:0,
	Type:0,
	Protection:.5,
	Damage:10,
	Height:0,
	Drag:1,
	Connnection:0,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Volcano",
	Description:"Impassable",
	Terrain:0,
	Type:7,
	Protection:0,
	Damage:0,
	Height:100,
	Drag:100,
	Connnection:4,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:-34
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Enriched Ore Deposit",
	Description:"Can be mined for money",
	Terrain:0,
	Type:4,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:0,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = { // index => 10
	Name:"Ore Deposit",
	Description:"Can be mined for money",
	Terrain:0,
	Type:4,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:0,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Depleted Ore Deposit",
	Description:"Can be mined for money",
	Terrain:0,
	Type:4,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:0,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};

	/// sea
Terrain_Data.TERRE[CURTERRE++] = { // index => 12
	Name:"Sea",
	Description:"Basic sea terrain",
	Terrain:2,
	Type:6,//0
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:3,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Reef",
	Description:"Hard to traverse sea terrain",
	Terrain:2,
	Type:6,//5
	Protection:.1,
	Damage:0,
	Height:10,
	Drag:2,
	Connnection:5,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Archipelago",
	Description:"Rough sea terrain",
	Terrain:2,
	Type:6,//1
	Protection:.2,
	Damage:0,
	Height:20,
	Drag:2,
	Connnection:5,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Rock Formation",
	Description:"Rocky sea terrain",
	Terrain:2,
	Type:6,//2
	Protection:.7,
	Damage:20,
	Height:0,
	Drag:2,
	Connnection:5,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Shore",
	Description:"An easy access to the sea",
	Terrain:2,
	Type:6,
	Protection:0,
	Damage:0,
	Height:0,
	Drag:1,
	Connnection:3,
	Modifiers:[CURMODS.Properties.Port],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"Bridge",
	Description:"Connects two islands, but provides no defense",
	Terrain:0,
	Type:8,
	Protection:0,
	Damage:0,
	Height:10,
	Drag:1,
	Connnection:8,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};
Terrain_Data.TERRE[CURTERRE++] = {
	Name:"High Bridge",
	Description:"Connects two islands, and allows ships to pass, but provides no defense",
	Terrain:0,
	Type:8,
	Protection:0,
	Damage:0,
	Height:20,
	Drag:1,
	Connnection:8,
	Modifiers:[],
	Sprite:null,
	X:0,
	Y:0
};

	/** Simple set for common data */
for(var x=1;x<Terrain_Data.TERRE.length;x++)
{
	// setting sprites
	var _t = Terrain_Data.TERRE[x];
	_t.Sprite = new Array(Terrain_Data.Connnection_Images(_t.Connnection));

	if(_t.Name=="Sea" || _t.Name=="Shore")
	{
		_t.Borders = new Array(11);
		for(var j=0;j<11;j++)
		{
			_t.Borders[j] = Images.Declare("Terrain/"+_t.Name+"/"+_t.Name+"Border"+j+".png",_t.Name+"Border"+j+"");
			_t.Borders[j].Stretch(true);
		}
	}

	if(_t.Connnection==5 || _t.Connnection==3)
	{
		_t.Sprite[0] = Images.Declare("Terrain/"+_t.Name+"/"+_t.Name+"0.png",_t.Name+"0");
		_t.Sprite[1] = Images.Declare("Terrain/"+_t.Name+"/"+_t.Name+"1.png",_t.Name+"1");
		_t.Sprite[2] = Images.Declare("Terrain/"+_t.Name+"/"+_t.Name+"2.png",_t.Name+"2");
		_t.Sprite[0].Stretch(true);
		_t.Sprite[1].Stretch(true);
		_t.Sprite[2].Stretch(true);
		_t.Sprite[3] = Images.Retrieve(_t.Name+"1");
		Animations.Declare(_t.Sprite, _t.Name+" Ani", 20, true);
		continue;
	}
	for(var i=0;i<_t.Sprite.length;i++)
	{
		_t.Sprite[i] = Images.Declare("Terrain/"+_t.Name+"/"+_t.Name+""+i+".png",_t.Name+i);
		_t.Sprite[i].Stretch(true);
	}
}
