/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project


// Declare(file, name, loop, volume, onload)

  /** Music sound track */

Music.Declare("intro theme", "intro", true, .4);
Music.Declare("editor/plains", "editor plains", true, .5);
Music.Declare("editor/water", "editor water", true, .4);

Music.Declare("game/intro", "game intro", true, .3);
Music.Declare("game/player", "player turn", true, .34);
Music.Declare("game/thinking", "thought music", true, .6);
Music.Declare("game/inactive", "hurry warning", true, .6);
Music.Declare("game/enemy", "enemy turn", true, .45);
Music.Declare("game/ally", "ally turn", true, .4);
Music.Declare("game/win", "game won", false, .35);
Music.Declare("game/lose", "game lost", false, .35);

  /** Enviornmental spacial effects */

Enviornment.Declare("weather/rain", "Rain", true, .8);
Enviornment.Declare("weather/snow", "Snow", true, .7);
Enviornment.Declare("weather/desert", "Heat Wave", true, .85);
Enviornment.Declare("weather/sunny", "Sunny", true, .8);

  /** Sound effects */

SFXs.Declare("empty", "quite");
SFXs.Declare("movement/air", "air", true);
SFXs.Declare("movement/boat", "boat", true);
SFXs.Declare("movement/jet", "jet", true);
SFXs.Declare("movement/footstep", "footstep", true);
SFXs.Declare("movement/car move", "car engine", true);
// SFXs.Declare("movement/helicopter", "helicopter", true);
// SFXs.Declare("movement/horse", "horse", true);
// SFXs.Declare("movement/train", "train", true);
SFXs.Declare("build", "build", false);
SFXs.Declare("explosion", "explosion", false, .5, function(self){self.Break_By(4);});
SFXs.Declare("attack/big gun", "big gun", false, .5, function(self){self.Break_By(4);});
SFXs.Declare("attack/light gun", "light gun", false, .5, function(self){self.Break_By(4);});
SFXs.Declare("attack/distance", "distance gun", false, .5, function(self){self.Break_By(4);});
SFXs.Declare("attack/machine gun", "machine gun", false, .5, function(self){self.Break_By(4);});

SFXs.Declare("map editor/placement sheet", "editor sheet", false, .3, function(self){self.Break_By(16);});
