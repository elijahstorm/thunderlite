/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project


var Building_Data = {
	PLACE:[],
	TypeToStr:["Operations","Construction","Resources","Weather"],
	TerrainType:["Ground","Air","Sea"],
	Get:function(check)
	{
		for(var i=0;i<Building_Data.PLACE.length;i++)
		{
			if(check==Building_Data.PLACE[i].Name)
			{
				return i;
			}
		}
		return 0;
	},
	Reverse_Get:function(index)
	{
		if(index<Building_Data.PLACE.length)
		return Building_Data.PLACE[index];
	},
	Factory:function(game, building, input, callback){
		if(game.Units_Map.At(building.X, building.Y)!=null)
		{
			if(callback!=null)callback(building);
			return false;
		}
		if(input==null)
		{	// display menu to ask what to build
			game.Interface.Open_Unit_Create_Menu(building.Owner, building.Owner.Cash_Money(), function(input){
				var player = building.Owner;
				if(!player.Can_Build(input, building))
				{
					if(callback!=null)callback(building);
					return false;
				}

				game.Send_Move('send build', building.Index, input);

				SFXs.Retrieve("build").Play();
				player.Add_Income(-player.Calculate_Cost(input));
				var c = new Characters.Char_Class(game, input);
				c.Alpha.data = 0;
				c.Set_Active(false);
				c.Idle = true;
				building.Idle = true;
				game.Add_Unit(c, building.X, building.Y, player.Team);
				building.End_Turn();
				game.Interface.Set_Unit_Focus(c);
				Core.Fade_Drawable(c, 255, 7, function(){
					c.Alpha.data = 255;
					game.Interface.Set_Unit_Focus();
					if(callback!=null)callback(building);
				});
			});
			return true;
		}
		var player = building.Owner;
		if(!player.Can_Build(input, building))
		{
			if(callback!=null)callback(building);
			return false;
		}
		SFXs.Retrieve("build").Play();
		player.Add_Income(-player.Calculate_Cost(input));
		var c = new Characters.Char_Class(game, input);
		c.Alpha.data = 0;
		c.Set_Active(false);
		c.Idle = true;
		building.Idle = true;
		game.Add_Unit(c, building.X, building.Y, player.Team);
		building.End_Turn();
		game.Interface.Set_Unit_Focus(c);
		Core.Fade_Drawable(c, 255, 7, function(){
			c.Alpha.data = 255;
			game.Interface.Set_Unit_Focus();
			if(callback!=null)callback(building);
		});
		return true;
	}
};

var CURPLACE = 0;
var CURMODS = Mod_List.Buildings;
Building_Data.PLACE[CURPLACE++] = {
	Name:"ERROR",
	Description:"ERROR",
	Type:-1,
	Terrain:-1,
	Protection:0,
	Stature:0,
	Defense:0,
	Injuries:0,
	Height:0,
	Drag:0,
	Modifiers:[],
	Sprite:ERRORIMG,
	X:0,
	Y:0
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Command Center",
	Description:"This is your base of operations. Do not allow the enemy to capture any command center.",
	Type:0,
	Terrain:0,
	Protection:.5,
	Stature:30,
	Defense:5,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:100,
	Drag:1,
	Modifiers:[CURMODS.Capture.Insta_Lose,CURMODS.Start_Turn.Heal_Team],
	Sprite:null,
	X:2,
	Y:-14
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Ground Control",
	Description:"It enables you to build ground units.",
	Type:0,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:2,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:50,
	Drag:1,
	Modifiers:[CURMODS.Capture.Allow_Ground],
	Sprite:null,
	X:2,
	Y:4
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Air Control",
	Description:"It enables you to build air units.",
	Type:0,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:2,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:50,
	Drag:1,
	Modifiers:[CURMODS.Capture.Allow_Air],
	Sprite:null,
	X:2,
	Y:-12
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Sea Control",
	Description:"It enables you to build sea units.",
	Type:0,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:2,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:50,
	Drag:1,
	Modifiers:[CURMODS.Capture.Allow_Sea],
	Sprite:null,
	X:2,
	Y:-11
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Warfactory",
	Description:"Allow you to build new units.",
	Type:1,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:5,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:30,
	Drag:1,
	Modifiers:[],
	Sprite:null,
	Act:Building_Data.Factory,
	X:2,
	Y:-6
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Port",
	Description:"Allow you to build new units.",
	Type:1,
	Terrain:2,
	Protection:.1,
	Stature:20,
	Defense:5,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:0,
	Resources:0,
	Importance:30,
	Drag:1,
	Modifiers:[],
	Sprite:null,
	Act:Building_Data.Factory,
	X:2,
	Y:-6
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"City",
	Description:"Supplies high income.",
	Type:2,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:0,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:120,
	Resources:1000,
	Importance:20,
	Drag:1,
	Modifiers:[CURMODS.Each_Turn.Supply_Income],
	Sprite:null,
	X:2,
	Y:-8
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Oil Refinary",
	Description:"Supplies moderate income.",
	Type:2,
	Terrain:0,
	Protection:.1,
	Stature:20,
	Defense:0,
	Injuries:0,
	Height:5,
	Capturable:true,
	Income:60,
	Resources:1000,
	Importance:5,
	Drag:1,
	Modifiers:[CURMODS.Each_Turn.Supply_Income],
	Sprite:null,
	X:13,
	Y:5
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Oil Rig",
	Description:"Supplies high income.",
	Type:2,
	Terrain:2,
	Protection:.1,
	Stature:20,
	Defense:0,
	Injuries:0,
	Height:20,
	Capturable:true,
	Income:120,
	Resources:1000,
	Importance:20,
	Drag:1,
	Modifiers:[CURMODS.Each_Turn.Supply_Income],
	Sprite:null,
	X:11,
	Y:-15
};
Building_Data.PLACE[CURPLACE++] = {
	Name:"Trading Port",
	Description:"Supplies moderate income.",
	Type:2,
	Terrain:2,
	Protection:.1,
	Stature:20,
	Defense:0,
	Injuries:0,
	Height:5,
	Capturable:true,
	Income:60,
	Resources:1000,
	Importance:5,
	Drag:1,
	Modifiers:[CURMODS.Each_Turn.Supply_Income],
	Sprite:null,
	X:13,
	Y:5
};

	/** Simple set for common data */
for(var x=1;x<Building_Data.PLACE.length;x++)
{
	// setting sprites
	var _b = Building_Data.PLACE[x];
	_b.Sprite = Images.Declare("Building/"+_b.Name+".png",_b.Name);
	_b.Sprite.Stretch(true);
	if(_b.Modifiers.length>0)
	{
		// writing descriptions
		for(var i=1;i<_b.Modifiers.length;i++)
		{
			// _b.Description+=_b.Modifiers[i].Name()+", ";
		}
		// _b.Description+=_b.Modifiers[0].Name();
	}
}
