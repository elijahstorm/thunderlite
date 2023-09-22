/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project


Menu.Button = [	"#056937",	"#08AF5C",	"#726962",	"#FFB200",	"#4B5148",	"#FDF5BF",	"#5B74FF"];
				// back	 	// hover	// shadow	// text		// idle		// active	// act.txt

/*** Map Editor ***/
let MapEditorClass = function(__saved_imgs) {
	let initalized = false;

	let Tile_Array;
	let self = this;

	let DATA = {
		id:-1,
		name:"",
		width:0,
		height:0,
		map_list:null,
		max_players:2,
		players:2,
		units:null,
		cities:null,
		weather:null,
		__script__:""
	};
	let CHOICE = {
		TERRAIN:0,
		UNITS:1,
		CITY:2,
		WEATHER:3
	};
	let SERVER = {
		LOAD:'download',
		SAVE:'update',
		PLAYTEST:'mark playtested',
		DELETE:'delete',
		PUBLISH:'publish',
		data_saved:false,
		beaten_game:false,
		local_saved_map:-1,
		new_map:true,
		Report_List:function(){},
		onReportGameList:function(fnc)
		{
			SERVER.Report_List = fnc;
		}
	};
	let TYPE = CHOICE.TERRAIN;
	let SELECTION = 0;
	let PAGE = 0;
	let ACTIVE_PLAYER = 0;
	let DEFULT_NAMES = ["Red","Blue","Green","Yellow"];
	let CONTAINER, CANVAS;
	let BLANK = BLANKIMG.Source();
	let SFX = SFXs.Retrieve("editor sheet");

			//** Add the game event handler interactions */
	const tile_size = 40;
	let scroller, tiling;
	let LEFT, TOP;
	let last_handler;
	let current_interactions = new Array(8);
	let mousedown = false;
	let __mousedown_time;
	let touchLocX, touchLocY;
	const ___touchstart = function(e) {
		e.preventDefault();

		__mousedown_time = e.timeStamp;
		scroller.doTouchStart(e.touches, e.timeStamp);
		mousedown = true;
		touchLocX = e.touches[0].pageX - 26;	// for mobile display offset
		touchLocY = e.touches[0].pageY - 151;

		return false;
	};
	const ___touchmove = function(e) {
		e.preventDefault();

		mousedown = false;
		scroller.doTouchMove(e.touches, e.timeStamp, e.scale)

		return false;
	};
	const ___touchend = function(e) {
		if(!mousedown)return;

		e.preventDefault();

		if(e.timeStamp-__mousedown_time<180)
		{
			let x = Math.floor((LEFT+touchLocX)/tile_size),
				y = Math.floor((TOP+touchLocY)/tile_size);

			SELECT(x, y);
		}

		scroller.doTouchEnd(e.timeStamp);
		mousedown = false;
		return false;
	};
	const ___touchcancel = function(e) {
		e.preventDefault();

		mousedown = false;
	};
	const ___mousedown = function(e) {
		__mousedown_time = e.timeStamp;
		scroller.doTouchStart([e], e.timeStamp);
		mousedown = true;
		return false;
	};
	const ___mouseup = function(e) {
		if(!mousedown)return;

		if(e.timeStamp-__mousedown_time<150)
		{
			let x = Math.floor((LEFT+e.layerX)/tile_size),
			y = Math.floor((TOP+e.layerY)/tile_size);

			SELECT(x, y);
		}

		scroller.doTouchEnd(e.timeStamp);
		mousedown = false;
		return false;
	};
	const ___contextmenu = function(e) {
		e.preventDefault();
		return false;
	};
	const ___mousemove = function(e) {

		scroller.doTouchMove([e], e.timeStamp);
		return false;
	};
	const set_current_interactions = function(list) {
		for(let i=0;i<8;i++)
		{
			if(list[i]!=null)
				current_interactions[i] = list[i];
		}
	};
	const do_current_interaction = function(index, e) {
		current_interactions[index](e);
	};
	const reset_interations = function(){
		set_current_interactions([
			___touchstart,	___touchmove,	___touchend,		___touchcancel,
			___mousedown,		___mouseup,		___contextmenu,	___mousemove]);
	};
	reset_interations();
	const Set_Controls = function(handler) {
		if(last_handler!=null)
		{
			return;
			last_handler.removeEventListener("touchstart touchmove touchend touchcancel mousedown mouseup contextmenu mousemove");
			last_handler = null;
		}
		if(handler==null)return;
		last_handler = handler;
		window.onkeyup = function(e){
			e = e || window.event;
			if (e.keyCode == '38') {
				scroller.scrollBy(0,-tile_size,true);
			}
			else if (e.keyCode == '40') {
				scroller.scrollBy(0,+tile_size,true);
			}
			else if (e.keyCode == '37') {
				scroller.scrollBy(-tile_size,0,true);
			}
			else if (e.keyCode == '39') {
				scroller.scrollBy(+tile_size,0,true);
			}
		};
		handler.addEventListener("touchstart", function(e){
			do_current_interaction(0, e);
		});
		handler.addEventListener("touchmove", function(e){
			do_current_interaction(1, e);
		});
		handler.addEventListener("touchend", function(e){
			do_current_interaction(2, e);
		});
		handler.addEventListener("touchcancel", function(e){
			do_current_interaction(3, e);
		});
		handler.addEventListener("mousedown", function(e){
			do_current_interaction(4, e);
		});
		handler.addEventListener("mouseup", function(e){
			do_current_interaction(5, e);
		});
		handler.addEventListener("contextmenu", function(e){
			do_current_interaction(6, e);
		});
		handler.addEventListener("mousemove", function(e){
			do_current_interaction(7, e);
		});
	};

		//** SERVER */
	function send_map_data_to_server(type, data) {
		if(!online)return;
		if(SERVER.new_map && type=='update')
			type = 'upload';
		socket.emit('mapdata '+type, socket.password, data);
	}
	function display_server_saved_maps(replace_old, create_new) {
		Clean_Popup_Screen();

		let _read_game_data = new Array(9),
			_data_text = new Array(9),
			_casings = new Array(9),
			_game_imgs = new Array(9);

		SERVER.onReportGameList(function(_list_data){
				/// start load maps
			for(let _m in _list_data)
			{
				try {
					let curMap = _list_data[_m];
					let index = curMap.saveindex;
					_data_text[index] = decrypt_game_data(curMap.map);
					_read_game_data[index] = Map_Reader.String(_data_text[index]);
					_read_game_data[index].id = curMap.map_id;
					_read_game_data[index].uploaded = curMap.uploaded;
					if(_read_game_data[index].Valid)
					{
						setTimeout(function(index){
							let sampledGame = new Engine_Class(_read_game_data[index], true);
							sampledGame.Set_Interface(INTERFACE);
							sampledGame.FORCE_MERGE_DISPLAY = true;

							let canvas = document.createElement("canvas");
							canvas.width = 600;
							canvas.height = 600;
							let ctx = canvas.getContext("2d");
							Canvas.ScaleImageData(ctx, INTERFACE.Get_Sample(sampledGame), 0, 0, 10/sampledGame.Terrain_Map.Width, 10/sampledGame.Terrain_Map.Height);

							_game_imgs[index].src = canvas.toDataURL("image/png");
							_casings[index].childNodes[0].remove();
							sampledGame.End_Game();

							let caption = document.createElement('p');
							caption.innerHTML = _read_game_data[index].Name;
							caption.style.margin = "0px";
							caption.style.padding = "0px 8px";
							caption.style.overflow = "hidden";
							caption.style.transform = "translate(0px, -4px)";
							caption.style.background = "#ccc859";
							caption.style.color = "#000";
							caption.style.borderRadius = "10px";

							let delete_btn = document.createElement('div');
							delete_btn.className = "w3-button w3-red";
							delete_btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
							delete_btn.style.borderRadius = "15px";
							delete_btn.style.transform = "translate(0px, 4px)";
							delete_btn.onclick = function() {
									// This will remove the player. Is that okay?
								let container = document.getElementById("e-p-content"),
									question, yes_btn, no_btn;
								Clean_Popup_Screen(container);

								question = document.createElement("p");
								question.className = "editor-border w3-sand";
								question.innerHTML = "Do you really want to delete "+_read_game_data[index].Name+"?";

								yes_btn = document.createElement('div');
								yes_btn.className = "w3-button w3-green w3-inline";
								yes_btn.innerHTML = "Yes";
								yes_btn.onclick = function(){
									send_map_data_to_server(SERVER.DELETE, _read_game_data[index].id);
								};

								no_btn = document.createElement('div');
								no_btn.className = "w3-button w3-red w3-inline";
								no_btn.innerHTML = "No";

								container.appendChild(question);
								container.appendChild(yes_btn);
								container.appendChild(no_btn);
								setTimeout(function() {
									document.getElementById("editor-popup").style.display = "block";
								}, 25);
								document.getElementById("editor-popup").onclick = function() {
									document.getElementById("editor-popup").style.display = 'none';
								};
							};

							_casings[index].appendChild(caption);
							_casings[index].appendChild(_game_imgs[index]);

							if(_read_game_data[index].uploaded)
							{
								let uploaded = document.createElement('img');
								uploaded.src = Images.Retrieve("Uploaded").Source();
								uploaded.style.display = "inline";
								uploaded.style.width = "30px";
								uploaded.style.transform = "translate(-15px, -40px)";
								delete_btn.style.transform = "translate(-15px, 4px)";
								_casings[index].appendChild(uploaded);
							}

							_casings[index].appendChild(delete_btn);
						}, 15, index);
					}
				} catch (e) {
					let index = _list_data[_m].saveindex;
					_read_game_data[index] = null;
					LOG.popup("Issue reading map #"+index);

					setTimeout(function(index, id){
						let delete_btn = document.createElement('div');
						delete_btn.className = "w3-button w3-red";
						delete_btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
						delete_btn.style.borderRadius = "15px";
						delete_btn.style.transform = "translate(0px, 4px)";

						delete_btn.onclick = function() {
							// This will remove the player. Is that okay?
							let container = document.getElementById("e-p-content"),
							question, yes_btn, no_btn;
							Clean_Popup_Screen(container);

							question = document.createElement("p");
							question.className = "editor-border w3-sand";
							question.innerHTML = "This map is corrupted, but doing this will permanently delete it. Try and content us to see if we can salvage your data first.<br /><br />Really delete it?";

							yes_btn = document.createElement('div');
							yes_btn.className = "w3-button w3-green w3-inline";
							yes_btn.innerHTML = "Yes";
							yes_btn.onclick = function(){
								send_map_data_to_server(SERVER.DELETE, id);
							};

							no_btn = document.createElement('div');
							no_btn.className = "w3-button w3-red w3-inline";
							no_btn.innerHTML = "No";

							container.appendChild(question);
							container.appendChild(yes_btn);
							container.appendChild(no_btn);
							setTimeout(function() {
								document.getElementById("editor-popup").style.display = "block";
							}, 25);
							document.getElementById("editor-popup").onclick = function() {
								document.getElementById("editor-popup").style.display = 'none';
							};
						};

						_casings[index].childNodes[0].remove();
						let sadface = document.createElement('i');
						sadface.className = "fas fa-sad-tear";
						_casings[index].appendChild(sadface);
						_casings[index].appendChild(document.createElement('div'));
						_casings[index].appendChild(delete_btn);
					}, 15, index, _list_data[_m].map_id);
				}
			}

			let container = document.getElementById("e-p-content"),
				casing, img, loading_icon;
			Clean_Popup_Screen(container);

			for(let i=0;i<9;i++)
			{
				casing = document.createElement('div');
				_casings[i] = casing;
				casing.style.width = "25%";
				casing.style.margin = "10px";
				casing.style.display = "inline-block";
				casing.style.cursor = "pointer";
				casing.onclick = function() {
					if(_read_game_data[i]==null) {
						if(create_new!=null) {
							if(DATA.name=="Unnamed Custom Map") {
								LOG.prompt("Give your map a name", function(result) {
									SERVER.local_saved_map = i;
									DATA.name = result;

									send_map_data_to_server(SERVER.SAVE, {
										index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
										name:DATA.name,
										map:encrypt_game_data(map_data_to_str())
									});
									DATA.data_saved = true;
									document.getElementById('editor-save-btn').className += " inactive";
									RECENTLY_SAVED = true;
								}, {
									min:3,
									max:20,
									disallow:";.[](){}\\/",
									reject:["Unnamed Custom Map"]
								});
							} else {
								SERVER.local_saved_map = i;

								send_map_data_to_server(SERVER.SAVE, {
									index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
									name:DATA.name,
									map:encrypt_game_data(map_data_to_str())
								});
								DATA.data_saved = true;
								document.getElementById('editor-save-btn').className += " inactive";
								RECENTLY_SAVED = true;
							}
							return;
						}
					} else {
						if(replace_old) {
								// This will remove the map. Is that okay?
							let question, yes_btn, no_btn;
							Clean_Popup_Screen(container);

							question = document.createElement("p");
							question.className = "editor-border w3-sand";
							question.innerHTML = "This will delete the map "+_read_game_data[i].Name+".<br /><br />Delete and Replace?";

							yes_btn = document.createElement('div');
							yes_btn.className = "w3-button w3-green w3-inline";
							yes_btn.innerHTML = "Yes";
							yes_btn.onclick = function(){
								if(DATA.name=="Unnamed Custom Map") {
									LOG.prompt("Give your map a name", function(result) {
										SERVER.local_saved_map = i;
										DATA.name = result;

										send_map_data_to_server(SERVER.DELETE, _read_game_data[i].id);

										setTimeout(function(){
											send_map_data_to_server(SERVER.SAVE, {
												index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
												name:DATA.name,
												map:encrypt_game_data(map_data_to_str())
											});
										}, 500);
										SERVER.data_saved = true;
										document.getElementById('editor-save-btn').className += " inactive";
										RECENTLY_SAVED = true;
									}, {
										min:3,
										max:20,
										disallow:";.[](){}\\/",
										reject:["Unnamed Custom Map"]
									});
								} else {
									SERVER.local_saved_map = i;

									send_map_data_to_server(SERVER.DELETE, _read_game_data[i].id);

									setTimeout(function(){
										send_map_data_to_server(SERVER.SAVE, {
											index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
											name:DATA.name,
											map:encrypt_game_data(map_data_to_str())
										});
									}, 500);
									SERVER.data_saved = true;
									document.getElementById('editor-save-btn').className += " inactive";
									RECENTLY_SAVED = true;
								}
							};

							no_btn = document.createElement('div');
							no_btn.className = "w3-button w3-red w3-inline";
							no_btn.innerHTML = "No";

							container.appendChild(question);
							container.appendChild(yes_btn);
							container.appendChild(no_btn);
							setTimeout(function() {
								document.getElementById("editor-popup").style.display = "block";
							}, 25);
							return;
						}
					}
					self.Open(i, _read_game_data[i]);
				};
				container.appendChild(casing);

				if(_read_game_data[i]!=null)
				{	// image display
					_game_imgs[i] = document.createElement('img');

					loading_icon = document.createElement('div');
					loading_icon.innerHTML = '<div class="lds-ellipsis"><div></div><div></div><div></div></div>';
					loading_icon.style.backgroundColor = "lightgrey";
					casing.appendChild(loading_icon);
				}
				else
				{	// empty new game here
					// casing.style.transform = "translate(0px, -60px)";
					_game_imgs[i] = document.createElement('div');
					_game_imgs[i].innerHTML = '<i class="w3-padding-32 fas fa-plus-square"></i>';
					_game_imgs[i].style.backgroundColor = "aqua";
					_game_imgs[i].onclick = function() {
						self.Open(i);
					};
					casing.appendChild(_game_imgs[i]);
				}
				_game_imgs[i].style.maxWidth = "100%";
				_game_imgs[i].style.borderRadius = "5px";
			}
		});

		send_map_data_to_server(SERVER.LOAD);
		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {
			document.getElementById("editor-popup").style.display = 'none';
		};
	}
	function map_img() {
		let sampledGame = new Engine_Class(Map_Reader.String(map_data_to_str()), true);
		sampledGame.Set_Interface(INTERFACE);
		sampledGame.FORCE_MERGE_DISPLAY = true;

		let canvas = document.createElement("canvas");
		canvas.width = 600;
		canvas.height = 600;
		let ctx = canvas.getContext("2d");
		Canvas.ScaleImageData(ctx, INTERFACE.Get_Sample(sampledGame), 0, 0, 10/sampledGame.Terrain_Map.Width, 10/sampledGame.Terrain_Map.Height);

		let img = canvas.toDataURL("image/png");
		sampledGame.End_Game();

		return img;
	}
	function map_data_to_str() {
		let str = ""+DATA.id+";";
		str+=DATA.name+";";
		str+=DATA.width+";";
		str+=DATA.height+";";
		for(let i=0;i<DATA.map_list.length;i++)
			str+=DATA.map_list[i]+":";
		str+=";";
		for(let i=0;i<DATA.max_players;i++)
			str+=DATA.players[i]+":";
		str+=";";
		for(let i=0;i<DATA.units.length;i++)
			str+=DATA.units[i]+":";
		str+=";";
		for(let i=0;i<DATA.cities.length;i++)
			str+=DATA.cities[i]+":";
		str+=";";
		str+=(DATA.weather[0] ? "1" : "0");
		for(let j=1;j<DATA.weather.length;j++) {
			str+=""+DATA.weather[j][0]+""+DATA.weather[j][1]+"-"+DATA.weather[j][2]+":";
		}
		str+=";";
		return str+DATA.__script__+";";
	}
	this.Server_Response = {
		Map_List:function(data)
		{
			SERVER.Report_List(data);
		},
		Report_Id:function(data)
		{
			SERVER.new_map = false;
			id = data;
		},
		Updated_With_Server:function(value)
		{
			data_saved = value;
		}
	};

			//** MAP SIZE */
	function make_map_bigger(new_x, new_y, start_x, start_y) {
		var new_list = new Array(new_x*new_y),
			_new = 0,
			_old = 0;

		for(let x=0;x<new_x;x++)
		{
			for(let y=0;y<new_y;y++)
			{
				if((x>=start_x && y>=start_y) && (x<DATA.width+start_x && y<DATA.height+start_y))
				{
					new_list[_new++] = DATA.map_list[_old++];
				}
				else new_list[_new++] = 1;
			}
		}

		DATA.width = new_x;
		DATA.height = new_y;
		DATA.map_list = new_list;

		for(let i in DATA.units)
		{
			DATA.units[i][1]+=start_x;
			DATA.units[i][2]+=start_y;
		}
		for(let i in DATA.cities)
		{
			DATA.cities[i][1]+=start_x;
			DATA.cities[i][2]+=start_y;
		}
	}
	function make_map_smaller(new_x, new_y, start_x, start_y) {
		var new_list = new Array(new_x*new_y),
			_new = 0,
			_old = start_x*DATA.height+start_y;

		for(let x=0;x<DATA.width;x++)
		{
			for(let y=0;y<DATA.height;y++)
			{
				if(x>=new_x || y>=new_y)
				{
					_old++;
					continue;
				}
				new_list[_new++] = DATA.map_list[_old++];
			}
		}

		DATA.width = new_x;
		DATA.height = new_y;
		DATA.map_list = new_list;

		for(let i=DATA.units.length-1;i>=0;i--)
		{
			DATA.units[i][1]-=start_x;
			DATA.units[i][2]-=start_y;
			if(DATA.units[i][1]<0 || DATA.units[i][2]<0)
				DATA.units.splice(i, 1);
			else if(DATA.units[i][1]>=DATA.width || DATA.units[i][2]>=DATA.height)
				DATA.units.splice(i, 1);
		}
		for(let i=DATA.cities.length-1;i>=0;i--)
		{
			DATA.cities[i][1]-=start_x;
			DATA.cities[i][2]-=start_y;
			if(DATA.cities[i][1]<0 || DATA.cities[i][2]<0)
				DATA.cities.splice(i, 1);
			else if(DATA.cities[i][1]>=DATA.width || DATA.cities[i][2]>=DATA.height)
				DATA.cities.splice(i, 1);
		}
	}
	function Change_Map_Size(x, y, start_x, start_y ) {	// in here puts the tile click controls
		if(x>30 || y>30)return;
		if(x<10 || y<10)return;
		if(x==DATA.width && y==DATA.height)return;

		if(DATA.map_list==null)
		{	// make new map
			DATA.width = x;
			DATA.height = y;
			DATA.map_list = new Array(DATA.width*DATA.height);
			for(let i=0;i<DATA.map_list.length;i++)
			{
				DATA.map_list[i] = 1;
			}
		} else {	// this is to resize map
			if(start_x==null)
				start_x = 0;
			if(start_y==null)
				start_y = 0;
			if(x>DATA.width)
				make_map_bigger(x, DATA.height, start_x, 0);
			if(x<DATA.width)
				make_map_smaller(x, DATA.height, start_x, 0);
			if(y>DATA.height)
				make_map_bigger(DATA.width, y, 0, start_y);
			if(y<DATA.height)
				make_map_smaller(DATA.width, y, 0, start_y);
		}
	}

			//** PLAYERS */
	function add_player() {	// increase max players
		if(DATA.max_players>=4)
		{
			DATA.max_players = 4;
			return false;
		}
		DATA.players.push(DEFULT_NAMES[DATA.max_players]);
		DATA.max_players++;
		return true;
	}
	function remove_player(PLAYER, callback) {	// decrease max players
		if(DATA.max_players<=2)return;
		if(PLAYER==NaN)return;
		PLAYER = Math.floor(PLAYER);
		if(PLAYER<0)return;
		if(PLAYER>=4)return;

			// This will remove the player. Is that okay?
		let container = document.getElementById("e-p-content"),
			question, yes_btn, no_btn;
		Clean_Popup_Screen(container);

		question = document.createElement("p");
		question.className = "editor-border w3-sand";
		question.innerHTML = "This will remove all of Player "+(PLAYER+1)+"'s units and cities. It won't change the script.<br />Make sure to check your script after to make sure it still works!<br /><br />Are you okay with this?";

		yes_btn = document.createElement('div');
		yes_btn.className = "w3-button w3-green w3-inline";
		yes_btn.innerHTML = "Yes";
		yes_btn.onclick = function(){
			DATA.max_players--;
			for(let i=DATA.units.length-1;i>=0;i--)
			{
				if(DATA.units[i][3]==PLAYER)
					DATA.units.splice(i, 1);
				else if(DATA.units[i][3]>PLAYER)
					DATA.units[i][3]--;
			}
			for(let i=DATA.cities.length-1;i>=0;i--)
			{
				if(DATA.cities[i][3]==PLAYER)
					DATA.cities.splice(i, 1);
				else if(DATA.cities[i][3]>PLAYER)
					DATA.cities[i][3]--;
			}
			document.getElementById('editor-players-amount').innerHTML = DATA.max_players;
			DATA.players.splice(PLAYER, 1);
			if(callback!=null) callback();
		};

		no_btn = document.createElement('div');
		no_btn.className = "w3-button w3-red w3-inline";
		no_btn.innerHTML = "No";

		container.appendChild(question);
		container.appendChild(yes_btn);
		container.appendChild(no_btn);
		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {
			document.getElementById("editor-popup").style.display = 'none';
		};
	}
	function change_active_player(PLAYER) {
		if(PLAYER>=DATA.max_players)return;
		if(PLAYER<0)return;
		if(PLAYER==NaN)return;

		ACTIVE_PLAYER = PLAYER;
		document.getElementById('editor-color-changer0').style.backgroundColor = data_to_hex(Team_Colors.Color[ACTIVE_PLAYER+1][0]);
		document.getElementById('editor-color-changer1').style.backgroundColor = data_to_hex(Team_Colors.Color[ACTIVE_PLAYER+1][0]);
		refresh_choice_images();
	}

			//** POP UP SCREENS */
	let menu_back_fnc = function() {};
	function Clean_Popup_Screen(container) {

		if(container==null)
			container = document.getElementById("e-p-content");
		for(let i=0;i<container.childNodes.length;)
		{
			container.childNodes[i].remove();
		}
	}
	function Open_Script_Editor() {
		let learnMoreLink = document.createElement('a');
		learnMoreLink.href = "/about/script";
		learnMoreLink.innerHTML = "Learn ThunderLite scripting";
		learnMoreLink.target = "_blank";
		learnMoreLink.id = "learnScriptLink";
		learnMoreLink.style.color = "#28C5D3";
		learnMoreLink.className = "w3-black w3-button"
		learnMoreLink.style.position = "absolute";
		learnMoreLink.style.left = "20px";
		learnMoreLink.style.top = "10px";

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let textarea = document.createElement('textarea');
		textarea.style.width = "100%";
		textarea.style.height = "300px";
		textarea.style.display = "block";
		textarea.value = DATA.__script__;
		textarea.focus();

		function scriptIsValid(_script) {
			if(_script.charAt(0)=='.')
			{	// test error
				return 10;
			}
			return 0;
		}
		function save_fnc() {
			let err = scriptIsValid(textarea.value);
			if(err!=0)
			{
				LOG.popup("Invalid game script",err);
				return;
			}
			__script__ = textarea.value;
			Edited();
			render(LEFT, TOP);
		}

		let save_btn = document.createElement('div');
		save_btn.className = "w3-button w3-green w3-inline w3-xlarge";
		save_btn.innerHTML = '<i class="fas fa-save"></i><div class="w3-hide-small"> SAVE</div>';
		save_btn.onclick = function(e) {
			save_fnc();
		};

		let exit_btn = document.createElement('div');
		exit_btn.className = "w3-button w3-red w3-inline w3-xlarge";
		exit_btn.innerHTML = '<i class="fas fa-times"></i><div class="w3-hide-small"> EXIT</div>';
		exit_btn.onclick = function(e) {
			document.getElementById("editor-popup").style.display = "none";
		};

		container.appendChild(learnMoreLink);
		container.appendChild(textarea);
		container.appendChild(document.createElement('br'));
		container.appendChild(save_btn);
		container.appendChild(exit_btn);
		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {};
	}
	function Open_Player_Info_Editor(PLAYER, NAME) {
		if(PLAYER>=DATA.max_players)return;
		if(PLAYER<0)return;

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let title = document.createElement('p');
		title.innerHTML = "Player # "+(PLAYER+1);
		title.className = "editor-third editor-border w3-sand";

		let textarea = document.createElement('input');
		textarea.className = "w3-rest";
		textarea.value = DATA.players[PLAYER];
		textarea.focus();

		function save_fnc() {
			if(textarea.value==0 || textarea.value==null)
			{
				LOG.popup("Can't have no name.");
				return;
			}
			if(textarea.value.length>=14)
			{
				LOG.popup("Name is too long.");
				return;
			}
			if(textarea.value.indexOf(".")==-1)
			if(textarea.value.indexOf("/")==-1)
			if(textarea.value.indexOf("\\")==-1)
			if(textarea.value.indexOf(":")==-1)
			if(textarea.value.indexOf(";")==-1)
			if(textarea.value.indexOf("-")==-1)
			if(textarea.value.indexOf("(")==-1)
			if(textarea.value.indexOf(")")==-1)
			if(textarea.value.indexOf("[")==-1)
			if(textarea.value.indexOf("]")==-1)
			if(textarea.value.indexOf("{")==-1)
			if(textarea.value.indexOf("]")==-1)
			{
				DATA.players[PLAYER] = textarea.value;
				NAME.innerHTML = textarea.value;
				Edited();
				return;
			}
			LOG.popup("Can't use those characters in the name.");
		}

		let save_btn = document.createElement('div');
		save_btn.className = "w3-button w3-green w3-inline w3-xlarge";
		save_btn.innerHTML = '<i class="fas fa-save"></i><div class="w3-hide-small"> SAVE</div>';
		save_btn.onclick = function(e) {
			save_fnc();
		};

		let exit_btn = document.createElement('div');
		exit_btn.className = "w3-button w3-red w3-inline w3-xlarge";
		exit_btn.innerHTML = '<i class="fas fa-times"></i><div class="w3-hide-small"> EXIT</div>';
		exit_btn.onclick = function(e) {
			document.getElementById("editor-popup").style.display = "none";
		};

		container.appendChild(title);
		container.appendChild(textarea);
		container.appendChild(document.createElement('br'));
		container.appendChild(save_btn);
		container.appendChild(exit_btn);
		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {};
	}
	function Open_Players_Editor() {
			/// Slide up
		let SLIDE = document.getElementById('editor-slide-up');
		SLIDE.className += " editor-slide-open";

		let close_p_fnc = function() {
			SLIDE.className = "editor-border w3-col w3-content w3-sand";
			self.Players = Open_Players_Editor;
		};
		document.getElementById('editor-slide-close').onclick = close_p_fnc;
		this.Players = close_p_fnc;

			/// Show current data
		document.getElementById('editor-players-amount').innerHTML = DATA.max_players;
		let LIST_CONTAINER = document.getElementById('editor-players-list');
		for(let i=0;i<LIST_CONTAINER.childNodes.length;)
			LIST_CONTAINER.childNodes[0].remove();

		function create_player(ADDITION) {
			let casing = document.createElement('div'),
				remove = document.createElement('div'),
				edit = document.createElement('div'),
				name = document.createElement('div');

			casing.className = "editor-border editor-tab";
			casing.style.backgroundColor = data_to_hex(Team_Colors.Color[ADDITION+1][0]);
			casing.style.maxHeight = "72px";

			name.className = "w3-padding-16 editor-margin w3-center";
			name.innerHTML = DATA.players[ADDITION];
			name.onclick = function() {
				change_active_player(ADDITION);
			};

			remove.className = "editor-half editor-border w3-button w3-black w3-small";
			remove.innerHTML = "<i class='fas fa-minus'></i>";
			remove.onclick = function() {
				remove_player(ADDITION, function() {
					self.Players();
					render(LEFT, TOP);
					self.Players();
				});
			};

			edit.className = "editor-half editor-border w3-button w3-small";
			edit.innerHTML = "<i class='fas fa-edit'></i>";
			edit.onclick = function() {
				Open_Player_Info_Editor(ADDITION, name);
			};

			casing.appendChild(remove);
			casing.appendChild(edit);
			casing.appendChild(name);
			return casing;
		}
		for(let i=0;i<DATA.max_players;i++)
		{
			LIST_CONTAINER.appendChild(create_player(i));
		}

		document.getElementById('editor-players-plus').onclick = function() {
			if(add_player()) LIST_CONTAINER.appendChild(create_player(DATA.max_players-1));
			document.getElementById('editor-players-amount').innerHTML = DATA.max_players;
		};
	}
	function Open_Weather_Editor() {

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let pallette = ["#EFCA8B", "#8BAFED", "#8AD7EA", "#E88888"];
		let __weather = [Images.Retrieve("Sunny Icon"), Images.Retrieve("Rainy Icon"), Images.Retrieve("Snowy Icon"), Images.Retrieve("Heat Icon")];
		let __names = ["Sunny", "Rainy", "Snowy", "Dry Heat"];
		let turn = DATA.weather.length-1;
		const STATIC_RATE = 1;
		let __cur_data = new Array(turn), __weather_pie_data;
		let __start_turn = 0;

		if(turn==0)
		{
			turn = 1;
			__cur_data.push(0);
		}
		else
		{
			for(let i=0;i<turn;i++)
			{
				__cur_data[i] = DATA.weather[i+1][0];
			}
		}

		let PIE = document.createElement('div');
		PIE.style.width = "100%";
		PIE.style.height = "300px";
		let TIMELINE = document.createElement('div');
		TIMELINE.style.width = "100%";
		TIMELINE.style.height = "300px";

		function updateWeather() {
			turn = __cur_data.length;
			__weather_pie_data = new Array(turn);
			for(let i=0;i<turn;i++)
			{
				__weather_pie_data[i] = [__cur_data[i], pallette[__cur_data[i]], __weather[__cur_data[i]]];
			}
			display_chart();
		}
		function display_chart() {
			Clean_Popup_Screen(PIE);
			Clean_Popup_Screen(TIMELINE);

			let __PIE_CHART = document.createElement('canvas');
			__PIE_CHART.width = PIE.clientWidth;
			__PIE_CHART.height = PIE.clientHeight;
			PIE.appendChild(__PIE_CHART);
			let __TIME_CHART = document.createElement('canvas');
			__TIME_CHART.width = PIE.clientWidth;
			__TIME_CHART.height = PIE.clientHeight;

__TIME_CHART.style.display = "none";

			TIMELINE.appendChild(__TIME_CHART);

			let __weather_pie = new Array(turn),
				__weather_colors = new Array(turn),
				__weather_pie_label = new Array(turn);
			for (let _p = 0; _p < turn; _p++) {
				__weather_pie[_p] = STATIC_RATE;
				__weather_colors[_p] = __weather_pie_data[_p][1];
				__weather_pie_label[_p] = __names[__weather_pie_data[_p][0]];
			}

			let __data_turns = new Array(turn),
				__weather_line = new Array(turn);
			for (let _t = 0; _t < turn; _t++) {
				__data_turns[_t] = "Turn "+(_t+1);
			}

			new Chart(__PIE_CHART.getContext('2d'), { // pie chart

				type: 'doughnut',
				data: {
					labels: __weather_pie_label,
					datasets: [{
						data: __weather_pie,
						backgroundColor: __weather_colors
					}]
				},
				options: {
  				legend: { display: false }
    		}
			});

			new Chart(__TIME_CHART.getContext('2d'), { // pie chart

				type: 'doughnut',
				data: {
					labels: __weather_pie_label,
					datasets: [{
						data: __weather_pie,
						backgroundColor: __weather_colors
					}]
				},
				options: {
  				legend: { display: false }
    		}
			});
		}
		function sendPatternToData() {
			DATA.weather = [DATA.weather[0]];
			for(let i=0;i<turn;i++)
			{
				DATA.weather.push([__cur_data[i], __start_turn+i, turn]);
			}
			Edited();
		}

		let save_btn = document.createElement('div');
		save_btn.className = "w3-button w3-green w3-inline w3-xlarge";
		save_btn.innerHTML = '<i class="fas fa-save"></i><div class="w3-hide-small"> SAVE</div>';
		save_btn.onclick = function(e) {
			sendPatternToData();
		};

		let del_btn = document.createElement('div');
		del_btn.className = "w3-button w3-red w3-inline w3-xlarge";
		del_btn.innerHTML = '<i class="fas fa-backspace"></i><div class="w3-hide-small"> DELETE</div>';
		del_btn.onclick = function(e) {
			if(turn<=1)return;
			turn--;
			__weather_pie_data.pop();
			__cur_data.pop();
			display_chart();
		};

		function weather_click_adder(type)
		{
			if(turn>=12)return;
			__cur_data.push(type);
			updateWeather();
		};

		let casing, img;
	  for(let i=0;i<Weather_Data.Global_Amount;i++)
	  {
			casing = document.createElement('div');
			casing.className = "editor-tab w3-button";
			casing.style.backgroundColor = pallette[i];
			casing.style.borderRadius = "90px";
			casing.style.padding = "5px";
			casing.onclick = function() {
				weather_click_adder(i);
			};

			img = document.createElement('img');
			img.src = Weather_Data.Get_Global(i).Icon.Source();

			casing.appendChild(img);
			container.appendChild(casing);
		}

		updateWeather();

		container.appendChild(PIE);
		container.appendChild(TIMELINE);
		container.appendChild(del_btn);
		container.appendChild(save_btn);

		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {};
	}
	function Open_Options() {
		document.getElementById('editor-menu-back-btn').style.display = "none";

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let caption, button;


		/// 1) allows you to rename the map

		let rename_map = document.createElement('div');
		rename_map.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Rename "+DATA.name;
		const RENAME_POINTER = caption;

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "OPEN";
		button.onclick = function(){
			LOG.prompt("Change the name from '"+DATA.name+"'?", function(result) {
				DATA.name = result;
				RENAME_POINTER.innerHTML = "Rename "+DATA.name;
				Edited();
			}, {
				min:3,
				max:20,
				disallow:";.[](){}\\/",
				reject:["Unnamed Custom Map"]
			});
		};

		rename_map.appendChild(button);
		rename_map.appendChild(caption);


		/// 1) make special conditions

		let special_conditions = document.createElement('div');
		special_conditions.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Special Conditions";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "OPEN";
		button.onclick = function(){
			Open_Special_Conditions();
		};

		special_conditions.appendChild(button);
		special_conditions.appendChild(caption);


		/// 2) limit units that can be built

		let limit_units = document.createElement('div');
		limit_units.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Restrict Units";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "OPEN";
		button.onclick = function(){
			Open_Restrict_Units();
		};

		limit_units.appendChild(button);
		limit_units.appendChild(caption);


		/// 3) fog of war option

		let fog_of_war = document.createElement('div');
		fog_of_war.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Fog of War";

		button = document.createElement('div');
		const fog_btn = button;
		function check_fog() {
			fog_btn.innerHTML = (DATA.weather[0]) ? "ON" : "OFF";
			fog_btn.className = "w3-button editor-tab w3-right w3-blue" + ((DATA.weather[0]) ? "" : "-grey");
		}
		button.onclick = function(){
			DATA.weather[0] = (DATA.weather[0]) ? false : true;
			check_fog();
			Edited();
		};
		check_fog();

		fog_of_war.appendChild(button);
		fog_of_war.appendChild(caption);


		/// 4) map size change

		let map_sizer = document.createElement('div');
		map_sizer.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Change Map Size";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "OPEN";
		button.onclick = function(){
			Open_Map_Size();
		};

		map_sizer.appendChild(button);
		map_sizer.appendChild(caption);


		container.appendChild(rename_map);
		container.appendChild(special_conditions);
		container.appendChild(limit_units);
		container.appendChild(fog_of_war);
		container.appendChild(map_sizer);

		document.getElementById("editor-popup").style.display = "block";
		document.getElementById("editor-popup").onclick = function() {};
	}

		/// ******************* STILL TO DO *******************
	function Open_Map_Size() {

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let caption, button;

		// Change_Map_Size(width+1, height, 0, 0); // >
		// Change_Map_Size(width+1, height, 1, 0); // <
		// Change_Map_Size(width, height+1, 0, 1); // ^
		// Change_Map_Size(width, height+1, 0, 0); // V
		//
		//
		// Change_Map_Size(width-1, height, 1, 0); // >
		// Change_Map_Size(width-1, height, 0, 0); // <
		// Change_Map_Size(width, height-1, 0, 1); // ^
		// Change_Map_Size(width, height-1, 0, 0); // V


		let map_sizer = document.createElement('div');
		map_sizer.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Content Available Next Update!";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "BACK";
		button.onclick = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};

		map_sizer.appendChild(button);
		map_sizer.appendChild(caption);

		container.appendChild(map_sizer);

		menu_back_fnc = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};
		document.getElementById('editor-menu-back-btn').style.display = "block";
	}
	function Open_Special_Conditions() {

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let caption, button;

		let special_conditions = document.createElement('div');
		special_conditions.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Content Available Next Update!";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "BACK";
		button.onclick = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};

		special_conditions.appendChild(button);
		special_conditions.appendChild(caption);

		container.appendChild(special_conditions);

		menu_back_fnc = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};
		document.getElementById('editor-menu-back-btn').style.display = "block";
	}
	function Open_Restrict_Units() {

		let container = document.getElementById("e-p-content");
		Clean_Popup_Screen(container);

		let caption, button;

		let special_conditions = document.createElement('div');
		special_conditions.className = "editor-options-list";

		caption = document.createElement('h3');
		caption.className = "editor-text w3-rest w3-left-align";
		caption.style.margin = "0px";
		caption.innerHTML = "Content Available Next Update!";

		button = document.createElement('div');
		button.className = "w3-button w3-black editor-tab w3-right";
		button.innerHTML = "BACK";
		button.onclick = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};

		special_conditions.appendChild(button);
		special_conditions.appendChild(caption);

		container.appendChild(special_conditions);

		menu_back_fnc = function() {
			Open_Options();
			menu_back_fnc = function() {};
		};
		document.getElementById('editor-menu-back-btn').style.display = "block";
	}

			//** MUSIC AND ART */
	let MUSIC_CHANGING = false;
	function Change_Music(change) {
		if(MUSIC_CHANGING)return;
		MUSIC_CHANGING = true;
		MUSIC = MUSIC.Switch(Music.Retrieve("editor "+change), 3000);
		setTimeout(function(){
			MUSIC_CHANGING = false;
		}, 3000);
	}
	function Play_Placement_SFX() {
		SFX.Play_Out(Math.floor(Math.random()*(SFX.Sprite_Amount())));
	}

			//** SIMPLE EDITING */
	let RECENTLY_SAVED = true;
	let SAVED_UNIT_IMAGES = __saved_imgs.units;
	let SAVED_PLACE_IMAGES = __saved_imgs.places;
	function refresh_choice_images() {
		let image_list = new Array(11);
		if(TYPE==CHOICE.TERRAIN) {
			let list = Terrain_Data.TERRE;
			for(let i=1;i<list.length;i++) {
				image_list[i] = list[i].Sprite[0].Source();
			}
		}
		else if(TYPE==CHOICE.UNITS) {
			let list = Char_Data.CHARS;
			for(let i=1;i<list.length;i++) {
				image_list[i] = SAVED_UNIT_IMAGES[ACTIVE_PLAYER+1][i].Source();
			}
		}
		else if(TYPE==CHOICE.WEATHER) {
			list = Weather_Data.WEATHER;
			for(let i=1;i<list.length;i++) {
				image_list[i] = list[i].Sprite[0].Source();
			}
		}
		else if(TYPE==CHOICE.CITY) {
			list = Building_Data.PLACE;
			for(let i=1;i<list.length;i++) {
				image_list[i] = SAVED_PLACE_IMAGES[ACTIVE_PLAYER+1][i].Source();
			}
		}
		for (let i = 1; i < 11; i++) {
			if(image_list[i+(10*PAGE)]==null)
				document.getElementById("editor-selection" + (i) + "img").src = BLANK;
			else document.getElementById("editor-selection" + (i) + "img").src =
				image_list[i+(10*PAGE)];
		}
	}
	function CHANGECHOICE(changeTo) {
		if(changeTo==CHOICE.TERRAIN)
		{
			TYPE = CHOICE.TERRAIN;
			refresh_choice_images();
		}
		else if(changeTo==CHOICE.UNITS)
		{
			TYPE = CHOICE.UNITS;
			refresh_choice_images();
		}
		else if(changeTo==CHOICE.CITY)
		{
			TYPE = CHOICE.CITY;
			refresh_choice_images();
		}
		else if(changeTo==CHOICE.WEATHER)
		{
			TYPE = CHOICE.WEATHER;
			refresh_choice_images();
		}
		else if(changeTo==CHOICE.ERASE)
			TYPE = CHOICE.ERASE;
	}
	function CHOOSEINDEX(index) {
		if(document.getElementById("editor-selection" + (index) + "img").src==BLANK)
			return;
		document.getElementById("editor-selection" + SELECTION).className = "w3-col editor-selections";
		SELECTION = index;
		document.getElementById("editor-selection" + SELECTION).className += " editor-selected";
	}
	function Allowed(_tile) {
		if(TYPE==CHOICE.UNIT)
		{
			if(ACTIVE_PLAYER==-1)return false;
			var _unit = Char_Data.CHARS[SELECTION];
			var _ter = Terrain_Data.TERRE[DATA.map_list[_tile]];
			if(_ter.Type==7)	// units cannot exist on impassable terrain
				return false;
			if(_ter.Type==6)	// ground units cannot traverse sea terrain
			if(_unit.Type==0)
				return false;
			if(_ter.Type==2)	// only foot units can climb rugged terrain
			if(_unit.Move_Type==1 || _unit.Move_Type==2)
				return false;
			if(_ter.Type!=6)	// sea units cannot traverse ground terrain
			if(_unit.Type==2)
				return false;
		}
		else if(TYPE==CHOICE.CITY)
		{
			var _city = Building_Data.PLACE[SELECTION];
			var _ter = Terrain_Data.TERRE[DATA.map_list[_tile]];
			if(_ter.Type==7)	// cities cannot be on impassable terrain
				return false;
			if(_ter.Type==2)	// cities cannot be on rugged terrain
				return false;
			if(_ter.Type==6)	// ground cities can't exist on sea terrain
			if(_city.Terrain==0)
				return false;
			if(_ter.Type!=6)	// sea cities can't exist on ground terrain
			if(_city.Terrain==2)
				return false;
		}
		else if(TYPE==CHOICE.TERRAIN)
		{
			var _ter = Terrain_Data.TERRE[SELECTION];

			if(Terrain_Data.Get("Shore")==SELECTION)
			{			// connections must be near at least one ground and one sea type
				var ground = false,
					sea = false,
					ter_check;
				if(_tile<DATA.map_list.length)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile+1]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile>0)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile-1]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile+height<DATA.map_list.length)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile+height]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile-height>0)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile-height]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				return (ground && sea);
			}
			if(_ter.Type==6)
			{
				if(Terrain_Data.Get("Sea")!=SELECTION)
				{		// sea interior cannot be placed near sea border
					if(_tile<DATA.map_list.length)
					if(Terrain_Data.TERRE[DATA.map_list[_tile+1]].Type!=6)
						return false;
					if(_tile>0)
					if(Terrain_Data.TERRE[DATA.map_list[_tile-1]].Type!=6)
						return false;
					if(_tile+height<DATA.map_list.length)
					if(Terrain_Data.TERRE[DATA.map_list[_tile+height]].Type!=6)
						return false;
					if(_tile-height>0)
					if(Terrain_Data.TERRE[DATA.map_list[_tile-height]].Type!=6)
						return false;
				}
			}
			else if(_ter.Type==8)
			{			// connections must be near at least one ground and one sea type
				var ground = false,
					sea = false,
					ter_check;
				if(_tile<DATA.map_list.length)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile+1]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile>0)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile-1]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile+height<DATA.map_list.length)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile+height]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(_tile-height>0)
				{
					ter_check = Terrain_Data.TERRE[DATA.map_list[_tile-height]];
					if(ter_check.Type==6)
						sea = true;
					else if(ter_check.Type<6 && ter_check.Type>=0)
						ground = true;
				}
				if(!ground || !sea)
					return false;
			}
		}
		return true;
	}
	function Edited() {
		SERVER.data_saved = false;
		SERVER.beaten_game = false;
		document.getElementById('editor-save-btn').className = "editor-tab w3-button w3-green";

		if(!RECENTLY_SAVED)return;	// stop from making multiple save timers at once
		RECENTLY_SAVED = false;
		setTimeout(function() {	// turn save button red after 5 minutes without saving
			if(RECENTLY_SAVED)return;	// if saved, no worries
			document.getElementById('editor-save-btn').className = "editor-tab w3-button w3-red";
		}, 300000);
	}
	function Reflow() {
		scroller.setDimensions(CONTAINER.clientWidth, CONTAINER.clientHeight+80, DATA.width*tile_size+10, DATA.height*tile_size);
	}
	function paint(y, x, left, top) {	//	inverting x & y on purpose
		let TILE = x*DATA.height+y;
		let y_scale = Terrain_Data.TERRE[DATA.map_list[TILE]].Sprite[0].Image().height/TILESIZE,
			y_diff = (Terrain_Data.TERRE[DATA.map_list[TILE]].Sprite[0].Image().height-TILESIZE)/y_scale;
		Terrain_Data.TERRE[DATA.map_list[TILE]].Sprite[0].Draw(CANVAS, left, top-y_diff, tile_size, tile_size*y_scale);
	}
	function render(left, top) {
		CANVAS.clearRect(0, 0, 600, 600);

		LEFT = Math.round(left);
		TOP = Math.round(top);

		tiling.render(LEFT, TOP, 1, paint);

		let flag_str, current, shrink_amt = tile_size/10;
		for(let i=0;i<DATA.cities.length;i++)
		{
			current = DATA.cities[i];
			SAVED_PLACE_IMAGES[current[3]+1][current[0]].Draw(CANVAS,
				current[1]*tile_size+shrink_amt-LEFT,
				current[2]*tile_size+shrink_amt-TOP,
				tile_size-(2*shrink_amt), tile_size-(2*shrink_amt));
		}
		for(let i=0;i<DATA.units.length;i++)
		{
			current = DATA.units[i];
			SAVED_UNIT_IMAGES[current[3]+1][current[0]].Draw(CANVAS,
				current[1]*tile_size+shrink_amt-LEFT,
				current[2]*tile_size+shrink_amt-TOP,
				tile_size-(2*shrink_amt), tile_size-(2*shrink_amt));
		}
	}
	function SELECT(x, y) {
		let tile = x*DATA.height+y;

		if(!Allowed(tile))
		{
			LOD.popup("ERROR");
			return;
		}

		Edited();

		let INDEX = PAGE*10+SELECTION;
		if(TYPE==CHOICE.TERRAIN)
		{
			if(SELECTION==0){
				DATA.map_list[tile] = 1;
			} else {
				DATA.map_list[tile] = INDEX;
				let _ter = Terrain_Data.TERRE[INDEX];
				for(let j in DATA.cities)
				{
					if(DATA.cities[j][1]==x && DATA.cities[j][2]==y)
					{
						var _city = Building_Data.PLACE[DATA.cities[j][0]];
						if(_ter.Type==0)
						if(_city.Terrain==2)
						{
							DATA.cities.splice(j, 1);
							break;
						}
						if(_ter.Type==6)
						if(_city.Terrain==0)
						{
							DATA.cities.splice(j, 1);
							break;
						}
						break;
					}
				}
				for(let j in DATA.units)
				{
					if(DATA.units[j][1]==x && DATA.units[j][2]==y)
					{
						var _unit = Char_Data.CHARS[DATA.units[j][0]];
						if(_ter.Type==0)
						if(_unit.Move_Type==6 || _unit.Move_Type==7)
						{
							DATA.units.splice(j, 1);
							break;
						}
						if(_ter.Type==6)
						if(_unit.Move_Type==0 || _unit.Move_Type==1 || _unit.Move_Type==2)
						{
							DATA.units.splice(j, 1);
							break;
						}
						break;
					}
				}
				let _wateramt = 49;
				for(let i=0;i<DATA.map_list.length;i++)
				{
					if(DATA.map_list[i]>=12)
					{
						_wateramt++;
					}
				}
				if(_wateramt>=DATA.width*DATA.height/2)
				{
					if(MUSIC.Name().includes("plains"))
					{
						Change_Music("water");
					}
				}
				else
				{
					if(MUSIC.Name().includes("water"))
					{
						Change_Music("plains");
					}
				}
			}
		}
		else if(TYPE==CHOICE.UNITS)
		{
			let found = false;
			for(let j in DATA.units)
			{
				if(DATA.units[j][1]==x && DATA.units[j][2]==y)
				{
					if(SELECTION==0)
					{
						DATA.units.splice(j, 1);
						render(LEFT, TOP);
						return;
					}
					else
					{
						DATA.units[j][0] = INDEX;
						DATA.units[j][3] = ACTIVE_PLAYER;
					}
					found = true;
					break;
				}
			}
			if(!found)
			{
				DATA.units.push([INDEX, x, y, ACTIVE_PLAYER]);
			}
		}
		else if(TYPE==CHOICE.CITY)
		{
			let found = false;
			for(let j in DATA.cities)
			{
				if(DATA.cities[j][1]==x && DATA.cities[j][2]==y)
				{
					if(SELECTION==0)
					{
						DATA.cities.splice(j, 1);
						render(LEFT, TOP);
						return;
					}
					else
					{
						DATA.cities[j][0] = INDEX;
						DATA.cities[j][3] = ACTIVE_PLAYER;
					}
					found = true;
					break;
				}
			}
			if(!found)
			{
				DATA.cities.push([INDEX, x, y, ACTIVE_PLAYER]);
			}
		}
		else if(TYPE==CHOICE.WEATHER)
		{
			LOG.popup("Weather Tiles coming in next update! Things like Clouds / Storm / Tornados / etc. They will affect flying units, and stealth ground units, but they move with the wind and don't stay in the same place.");
		}

		Play_Placement_SFX();
		render(LEFT, TOP);
	}

			//** UI COMMUNICATION */
	this.Save = function() {
		if(SERVER.data_saved)return;
		if(RECENTLY_SAVED)return;

		if(SERVER.local_saved_map==-1)
		{	// ask to save, because user created a map before saving
			display_server_saved_maps(true, true);
			return;
		}

		if(DATA.name=="Unnamed Custom Map") {
			LOG.prompt("Give your map a name", function(result) {
				DATA.name = result;

				send_map_data_to_server(SERVER.SAVE, {
					index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
					name:DATA.name,
					map:encrypt_game_data(map_data_to_str())
				});
				SERVER.data_saved = true;
				document.getElementById('editor-save-btn').className += " inactive";
				RECENTLY_SAVED = true;
			}, {
				min:3,
				max:20,
				disallow:";.[](){}\\/",
				reject:["Unnamed Custom Map"]
			});
		} else {
			send_map_data_to_server(SERVER.SAVE, {
				index:DATA.id==-1 ? SERVER.local_saved_map : DATA.id,
				name:DATA.name,
				map:encrypt_game_data(map_data_to_str())
			});
			SERVER.data_saved = true;
			document.getElementById('editor-save-btn').className += " inactive";
			RECENTLY_SAVED = true;
		}
	};
	this.Load = function() {
		if(this.Players!=Open_Players_Editor)
		{
			this.Players();
		}
		display_server_saved_maps();
	};
	this.Test = function() {
		let each_player = new Array(DATA.max_players);
		for(let i=0;i<each_player.length;i++)
			each_player[i] = false;
		for(let i in DATA.units)
			each_player[DATA.units[i][3]] = true;
		for(let i in each_player)
		{
			if(!each_player[i])
			{
				LOG.popup("Each player must have at least one unit to Test.", "#f00",3000);
				return;
			}
		}
		// all players have to have at least one unit to play

		if(SERVER.local_saved_map==-1)
		{	// ask to save, because user created a map before saving
			display_server_saved_maps();
			return;
		}

		new_custom_game(map_data_to_str(), [DATA.name], true, SERVER.local_saved_map, 1);
	};
	this.Options = function() {
		Open_Options();
	};
	this.Players = Open_Players_Editor;
	this.Weather = function() {
		Open_Weather_Editor();
	};
	this.Script = function () {
		Open_Script_Editor();
	};
	this.Upload = function() {
		if(!SERVER.beaten_game)return;
		if(!SERVER.data_saved)return;

		send_map_data_to_server(SERVER.PUBLISH, {
			pic:map_img(),
			// pic:encrypt_game_data(map_img()),
			id:DATA.id
		});
		LOG.popup("Successfully uploaded.");
	};
	this.Back = function() {
		menu_back_fnc();
	};
	this.Page_Left = function() {
		if(PAGE==0)
			return;
		PAGE--;
		refresh_choice_images();
	};
	this.Page_Right = function() {
		if(TYPE==CHOICE.TERRAIN)
		{
			if(PAGE*10+11>=Terrain_Data.TERRE.length)
				return;
		}
		else if(TYPE==CHOICE.UNITS)
		{
			if(PAGE*10+11>=Char_Data.CHARS.length)
				return;
		}
		else if(TYPE==CHOICE.CITY)
		{
			if(PAGE*10+11>=Building_Data.PLACE.length)
				return;
		}
		else if(TYPE==CHOICE.WEATHER)
		{
			if(PAGE*10+11>=Weather_Data.WEATHER.length)
				return;
		}
		PAGE++;
		refresh_choice_images();
	};
	this.Choose = function(choice) {
		PAGE = 0;
		CHANGECHOICE(choice);
	};

	this.Spit = function() {
		return encrypt_game_data(map_data_to_str());
	};

			//** CREATING AND OPENING MAP DATA */
	this.Init = function() {
		if(initalized)return;
		initalized = true;
		CONTAINER = document.getElementById('editor-tile-holder');
		for(let i=0;i<CONTAINER.childNodes.length;)
			CONTAINER.childNodes[0].remove();

		let holder = document.createElement('canvas');
		holder.width = CONTAINER.clientWidth;
		holder.height = CONTAINER.clientHeight;
	 	CANVAS = holder.getContext("2d");

		Set_Controls(holder);
		CONTAINER.appendChild(holder);
		window.onresize = function() {
			holder.width = CONTAINER.clientWidth;
			Reflow();
		};

		scroller = new Scroller(render, {
			bouncing:false,
			locking:false,
			zooming:false
		});

		let selectionHolder = document.getElementById('editor-selction-holder');
		let selection, img, index;
		for(index=1;index<11;index++)
		{
			selection = document.createElement('div');
			selection.className = "w3-col editor-selections";
			selection.style.width = "50px";
			selection.id = "editor-selection" + (index);
			selection.onclick = function() {
				CHOOSEINDEX(parseInt(this.id.split("editor-selection")[1]));
			};

			img = document.createElement('img');
			img.id = "editor-selection" + (index) + "img";
			img.className = "editor-selections-img";
			img.style.maxHeight = "44px";
			img.src = Terrain_Data.TERRE[index].Sprite[0].Source();

			selection.appendChild(img);
			selectionHolder.appendChild(selection);
		}

		index = 0;
		selection = document.createElement('div');
		selection.className = "w3-col editor-selections";
		selection.style.width = "50px";
		selection.id = "editor-selection" + (index);
		selection.onclick = function() {
			CHOOSEINDEX(parseInt(this.id.split("editor-selection")[1]));
		};

		img = document.createElement('i');
		img.id = "editor-selection" + (index) + "img";
		img.className = "editor-selections-img";
		img.style.fontSize = "200%";
		img.className = "fas fa-eraser";

		selection.appendChild(img);
		selectionHolder.appendChild(selection);

		index = 11;
		selection = document.createElement('div');
		selection.className = "w3-col editor-selections";
		selection.style.width = "50px";
		selection.id = "editor-selection" + (index);
		selection.onclick = function() {
			CHOOSEINDEX(parseInt(this.id.split("editor-selection")[1]));
		};

		img = document.createElement('i');
		img.id = "editor-selection" + (index) + "img";
		img.className = "editor-selections-img";
		img.style.fontSize = "200%";
		img.className = "fas fa-question";

		selection.appendChild(img);
		selectionHolder.appendChild(selection);
	};
	this.Open = function(save_data_index, game_data, tested_complete) {
		if(tested_complete)
		{
			send_map_data_to_server(SERVER.PLAYTEST, game_data.id);
			SERVER.beaten_game = true;
			SERVER.data_saved = true;
			document.getElementById('editor-upload-btn').style.display = "block";
		} else document.getElementById('editor-upload-btn').style.display = "none";

		SERVER.local_saved_map = (save_data_index==null) ? -1 : save_data_index;

		if(game_data==null || !game_data.Valid)
		{
			DATA.id = -1;
			DATA.units = new Array();
			DATA.cities = new Array();
			DATA.weather = [0];
			DATA.name = "Unnamed Custom Map";
			DATA.max_players = 2;
			DATA.players = new Array(DATA.max_players);
			for(let i=0;i<DATA.max_players;i++)
				DATA.players[i] = DEFULT_NAMES[i];

			Change_Map_Size(10, 10);
			SERVER.new_map = true;
		}
		else
		{
			SERVER.new_map = false;

			let data = game_data.Data.Get();
			DATA.id = game_data.id;
			DATA.name = data.name;

			Change_Map_Size(data.t_width, data.t_height);
			for(let x=0,i=0;x<DATA.width;x++)
			for(let y=0;y<DATA.height;y++)
				DATA.map_list[i++] = data.terrain[x][y];

			DATA.players = data.p_list;
			DATA.max_players = DATA.players.length;
			DATA.units = data.u_list;
			DATA.cities = data.c_list;
			DATA.weather = data.w_data;
			DATA.__script__ = data.__script;

			if(game_data.uploaded)
			{
				LOG.popup("Warning: This map is already uploaded. Editing and Saving " +
				 "this map will remove it from the published maps page. You will have "+
				 "to re-test it and re-publish it to put it back on the public server.");
			}
		}

		tiling = new Tiling;
		tiling.setup(CONTAINER.clientWidth, CONTAINER.clientHeight,
			DATA.width*tile_size, DATA.height*tile_size, tile_size, tile_size);

		Reflow();
		change_active_player(0);
		CHANGECHOICE(CHOICE.TERRAIN);
		CHOOSEINDEX(1);
	};
};
var Map_Editor;



/*** In game unit popup, unit double click ***/
Menu.Game_Prompt = new Menu.Menu_Class();

/*** Overlay to stop input ***/
Menu.No_Touch_Overlay = new Menu.Menu_Class("#444C");
Menu.No_Touch_Overlay.Add(new Canvas.Drawable(new Text_Class("20pt Impact", "#FFF"), null, 300, 100, 200, 200, "Input stopped until user reconnects"));
Menu.No_Touch_Overlay.Add(new Canvas.Drawable(new Text_Class("15pt Impact", "#FFF"), null, 300, 300, 200, 200, "If 30 seconds pass, they will forfeit"));

/*** Game Internal Lobby Menu ***/
Menu.PreGame = {};
Menu.PreGame.Slots = [];
Menu.PreGame.AddStarter = function(mapName){
	let START = document.createElement('button');
	START.id = "HOSTGAMESTART";
	START.innerHTML = INTERFACE.Game.Full() ? "Start Game" : "Start with AI";
	START.onclick = function(){
		INTERFACE.Game.Host_Game(socket.game_id);
		START.remove();
	};
	START.className = "w3-button w3-block w3-black w3-margin-bottom";

	let HOLDER = document.getElementById("HOSTGAMEBUTTONS");
	for(let i=2;i<HOLDER.childNodes.length;i++) {
		HOLDER.childNodes[i].remove();
	}
	HOLDER.appendChild(START);
};
Menu.PreGame.Set = function(index,value){
	if(index>=this.Slots.length)return;

	document.getElementById("HOSTGAMEPLAYERLIST"+index).innerHTML = value=="" ? "---" : value;
	this.Slots[index] = value;

	if(document.getElementById("HOSTGAMESTART")==null)return;
	document.getElementById("HOSTGAMESTART").innerHTML = INTERFACE.Game.Full() ? "Start Game" : "Start with AI";
};
Menu.PreGame.Leave = function(){
	INTERFACE.Game.Send_Move('leave');
	mainMenu();
	changeContent(CONTENT_REDIRECT);
};
Menu.PreGame.visibleMapID = function(txt){
	if(txt==null)return "";
	if(txt.length!=9)return "";
	return txt.substring(0, 3) + " - " + txt.substring(3, 6) + " - " + txt.substring(6, 9);
};
Menu.PreGame.Setup_Map = function(map){
	if(map==null)return;
	if(!map.Valid)return;

	let playersAmount = map.Player_Amount(),
		__name = map.Name,
		__id = map.id;
	let doc_list = document.getElementById("HOSTGAMEPLAYERS");

	while(doc_list.childNodes.length>0)
	{
		doc_list.removeChild(doc_list.childNodes[0]);
	}

	document.getElementById("HOSTGAMEMAPNAME").innerHTML = "<b>"+__name+"</b>";
	document.getElementById("HOSTGAMEMAPID").innerHTML = Menu.PreGame.visibleMapID(__id);

	this.Slots = new Array(playersAmount);
	let curEl;

	for(let i=0;i<playersAmount;i++)
	{
		curEl = document.createElement('div');
		curEl.id = "HOSTGAMEPLAYERLIST"+i;
		curEl.innerHTML = "<div class='w3-center lds-ellipsis' style='color:black;max-height:14px;'><div></div><div></div><div></div></div>";
		curEl.className = "INFO-LIST";
		doc_list.appendChild(curEl);
	}
};
