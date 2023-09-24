export const ___touchstart = function(e) {
    HUD_Actions.interact();
    e.preventDefault();

    let x = Math.round(e.touches[0].pageX);
    let y = Math.round(e.touches[0].pageY);
    y-=85; // this is to adjust for the header
    if(clientWidth>600)
        x-=Math.floor((clientWidth-600)/2);

    mousedown = true;
    __mousedown_time = e.timeStamp;
    last_touch_loc[0] = x;
    last_touch_loc[1] = y;

    if(!self.Click(x, y))return false;

    touch_start_loc[0] = x;
    touch_start_loc[1] = y;

    scroller.doTouchStart(e.touches, e.timeStamp);

    return false;
};
export const ___touchmove = function(e) {
    e.preventDefault();
    let x = Math.round(e.touches[0].pageX);
    let y = Math.round(e.touches[0].pageY);
    y-=85; // this is to adjust for the header
    if(clientWidth>600)
        x-=Math.floor((clientWidth-600)/2);

    last_touch_loc[0] = x;
    last_touch_loc[1] = y;

    if(Math.abs(x-touch_start_loc[0])<5 &&
        Math.abs(y-touch_start_loc[1])<5)
        return false;

    self.Mouse_Move(x, y);

    scroller.doTouchMove(e.touches, e.timeStamp, e.scale)

    return false;
};
export const ___touchend = function(e) {
    e.preventDefault();
    if(!mousedown)return false;

    let x = Math.round(last_touch_loc[0]);
    let y = Math.round(last_touch_loc[1]);

    if(e.timeStamp-__mousedown_time<170)	// if released quickly ...
        self.Release(x, y);

    scroller.doTouchEnd(e.timeStamp);
    touch_start_loc[0] = -1;
    touch_start_loc[1] = -1;
    mousedown = false;

    return false;
};
export const ___touchcancel = function(e) {
    e.preventDefault();

    scroller.doTouchEnd(e.timeStamp);
    touch_start_loc[0] = -1;
    touch_start_loc[1] = -1;
    last_touch_loc[0] = -1;
    last_touch_loc[1] = -1;
    mousedown = false;
};
export const ___mousedown = function(e) {
    try {
        HUD_Actions.interact();

        let x = e.pageX,
            y = e.pageY-85;
        if(clientWidth>600)
            x-=Math.floor((clientWidth-600)/2);

        // if(!self.Click(x, y)) return false;
        if(!self.Click(x, y))
        if(open_menu!=Menu.Game_Prompt)
        {	// remove on unit create improve
            return false;
        }
        if(e.target.tagName.match(/input|textarea|select/i)) {
            return;
        }

        scroller.doTouchStart([{
            pageX: x,
            pageY: y
        }], e.timeStamp);
        mousedown = true;
        return false;
    } catch (e) {

    } finally {
        return false;
    }
};
export const ___mouseup = function(e) {
    try {
        if(e.which==3)return true;
        let x = e.pageX,
            y = e.pageY-85;
        if(clientWidth>600)
            x-=Math.floor((clientWidth-600)/2);
        self.Release(x, y);
        if(!mousedown)return;
        scroller.doTouchEnd(e.timeStamp);
        mousedown = false;
        return false;
    } catch (e) {

    } finally {
        return false;
    }
};
export const ___contextmenu = function(e) {
    e.preventDefault();
    let x = e.pageX,
        y = e.pageY-85;
    if(clientWidth>600)
        x-=Math.floor((clientWidth-600)/2);
    self.Right_Click(x, y);
    return false;
};
export const ___mousemove = function(e) {
    let x = e.pageX,
        y = e.pageY-85;
    if(clientWidth>600)
        x-=Math.floor((clientWidth-600)/2);
    if(!mousedown)
    {
        self.Mouse_Move(x, y);
        return;
    }
    if(selected_unit!=null)
    if(selected_unit.Mover!=null)
    {
        uiCanvas.clearRect(0,0,900,900);
        selected_unit.Mover.Draw();
    }
    scroller.doTouchMove([{
        pageX: x,
        pageY: y
    }], e.timeStamp);
    return false;
};