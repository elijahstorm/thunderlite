/// Code written and created by Elijah Storm
// Copywrite April 5, 2020
// for use only in ThunderLite Project


var Team_Colors = {
	Health_Display:["#FF6347","#FFBF46","#E2FF46","#86FF46"],
	Color:[ // light to dark
		[[255,208,204],[232,186,185],[168,134,139],[102,81,99],[129,25,75]], // grey
		[[255,144,133],[233,56,46],[170,22,44],[102,26,94],[129,25,75]], // red
		[[169,207,255],[69,164,225],[43,95,199],[61,49,127],[25,62,127]], // blue
		[[142,255,152],[59,255,20],[67,193,56],[22,145,15],[25,127,75]], // green
		[[255,255,142],[229,229,43],[206,109,28],[125,137,13],[127,119,25]], // yellow
	],
	Hue:[0, 0, 240, 120, 60],
	Player:["White","Red","Blue","Green","Yellow"],
	Flags:[Images.Retrieve("White Flag"),Images.Retrieve("Red Flag"),Images.Retrieve("Blue Flag"),Images.Retrieve("Green Flag"),Images.Retrieve("Yellow Flag")],
	Base:Images.Retrieve("Flag Base"),
	Draw:function(canvas, x, y, h, player)
	{
		if(player==null)
			player = this.Flags[0];
		else player = this.Flags[player.Color];
		player.Draw(canvas, x, y-17);
		this.Base.Draw(canvas, x, y, 4, h);
	}
};

function data_to_hex(data, alpha)
{
	if(data.length!=3 && data.length!=4)return "#000";
	if(data.length!=4 && alpha!=null)
		data[3] = alpha;
	return "#"+data[0].toString(16)+data[1].toString(16)+data[2].toString(16)+(data[3]==null ? "" : data[3].toString(16));
}

// Changes the RGB/HEX temporarily to a HSL-Value, modifies that value
// and changes it back to RGB/HEX.

function changeHue(rgb, degree) {
    let hsl = rgbToHSL(rgb[0], rgb[1], rgb[2]);
    hsl.h += degree;
    if (hsl.h > 360) {
        hsl.h -= 360;
    }
    else if (hsl.h < 0) {
        hsl.h += 360;
    }
    return hslToRGB(hsl);
}

// exepcts a string and returns an object
function rgbToHSL(r, g, b) {
		r/=255;
		g/=255;
		b/=255;
    let cMax = Math.max(r, g, b),
        cMin = Math.min(r, g, b),
        delta = cMax - cMin,
        l = (cMax + cMin) / 2,
        h = 0,
        s = 0;

    if (delta == 0) {
        h = 0;
    }
    else if (cMax == r) {
        h = 60 * (((g - b) / delta) % 6);
    }
    else if (cMax == g) {
        h = 60 * (((b - r) / delta) + 2);
    }
    else {
        h = 60 * (((r - g) / delta) + 4);
    }

    if (delta == 0) {
        s = 0;
    }
    else {
        s = (delta/(1-Math.abs(2*l - 1)))
    }

    return {
        h: h,
        s: s,
        l: l
    }
}

// expects an object and returns a string
function hslToRGB(hsl) {
    let h = hsl.h,
        s = hsl.s,
        l = hsl.l,
        c = (1 - Math.abs(2*l - 1)) * s,
        x = c * ( 1 - Math.abs((h / 60 ) % 2 - 1 )),
        m = l - c/ 2,
        r, g, b;

    if (h < 60) {
        r = c;
        g = x;
        b = 0;
    }
    else if (h < 120) {
        r = x;
        g = c;
        b = 0;
    }
    else if (h < 180) {
        r = 0;
        g = c;
        b = x;
    }
    else if (h < 240) {
        r = 0;
        g = x;
        b = c;
    }
    else if (h < 300) {
        r = x;
        g = 0;
        b = c;
    }
    else {
        r = c;
        g = 0;
        b = x;
    }

    r = normalize_rgb_value(r, m);
    g = normalize_rgb_value(g, m);
    b = normalize_rgb_value(b, m);

    return [r,g,b];
}

function normalize_rgb_value(color, m) {
    color = Math.floor((color + m) * 255);
    if (color < 0) {
        color = 0;
    }
    return color;
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}


function changePixels(img, d1, d2)
{
	for(let i=0;i<img.data.length;i+=4)
	{
		for(let k=0;k<d1.length;k++)
		{
			if(Math.abs(img.data[i]-d1[k][0])<=5)
			if(Math.abs(img.data[i+1]-d1[k][1])<=5)
			if(Math.abs(img.data[i+2]-d1[k][2])<=5)
			{
				img.data[i] = d2[k][0];
				img.data[i+1] = d2[k][1];
				img.data[i+2] = d2[k][2];
				break;
			}
		}
	}
	return img;
}
function recolor(img, original, adjusted, hardness)
{
	if(original.length!=adjusted.length) return;
	if(hardness==null) hardness = 10;
	for(let i=0;i<img.data.length;i+=4)
	{
		for(let k=0;k<original.length;k++)
		{
			if(Math.abs(img.data[i]-original[k][0])<=hardness)
			if(Math.abs(img.data[i+1]-original[k][1])<=hardness)
			if(Math.abs(img.data[i+2]-original[k][2])<=hardness)
			{
				img.data[i] = adjusted[k][0];
				img.data[i+1] = adjusted[k][1];
				img.data[i+2] = adjusted[k][2];
				break;
			}
		}
	}
}
function hueshift(img, shift, colorpicker, hardness)
{
	let data;
	for(let i=0;i<img.data.length;i+=4)
	{
		total = img.data[i]+img.data[i+1]+img.data[i+2];
		if(Math.abs(img.data[i]-colorpicker[0])>hardness) continue;
		if(Math.abs(img.data[i+1]-colorpicker[1])>hardness) continue;
		if(Math.abs(img.data[i+2]-colorpicker[2])>hardness) continue;
		data = changeHue([img.data[i], img.data[i+1], img.data[i+2]], shift);
		img.data[i] = data[0];
		img.data[i+1] = data[1];
		img.data[i+2] = data[2];
	}
}

function color_square(w, h, __color)
{
	let img = imageHolderCanvas.createImageData(Math.floor(w), Math.floor(h));
	for(let i=0;i<img.data.length;i+=4)
	{
		img.data[i] = __color[0];
		img.data[i+1] = __color[1];
		img.data[i+2] = __color[2];
		img.data[i+3] = __color[3];
	}
	return img;
}

function flipX(img)
{
	for(let i=0;i<img.height;i++)
	{
		let index = i*img.width*4;
		for(let j=0;j<img.width/2;j++)
		{
			let left = index+j*4;
			let right = index+(img.width-j-1)*4;
			let temp = [img.data[left],img.data[left+1],img.data[left+2],img.data[left+3]];
			img.data[left] = img.data[right];
			img.data[left+1] = img.data[right+1];
			img.data[left+2] = img.data[right+2];
			img.data[left+3] = img.data[right+3];
			img.data[right] = temp[0];
			img.data[right+1] = temp[1];
			img.data[right+2] = temp[2];
			img.data[right+3] = temp[3];
		}
	}
	return img;
}

function opacity(img, amt)
{
	if(!amt)amt=.7;
	let temp = imageHolderCanvas.createImageData(img.width,img.height);
	for(let i=0;i<img.data.length;i+=4)
	{
		temp.data[i] = img.data[i];
		temp.data[i+1] = img.data[i+1];
		temp.data[i+2] = img.data[i+2];
		if(img.data[i+3]==0)continue;
		temp.data[i+3] = amt;
	}
	return temp;
}

function darken(img, amt)
{
	if(!amt)amt=.7;
	let temp = imageHolderCanvas.createImageData(img.width,img.height);
	for(let i=0;i<img.data.length;i+=4)
	{
		temp.data[i] = img.data[i]*amt;
		temp.data[i+1] = img.data[i+1]*amt;
		temp.data[i+2] = img.data[i+2]*amt;
		temp.data[i+3] = img.data[i+3];
	}
	return temp;
}

function scale(img, xScale, yScale)
{
	let widthScaled = Math.floor(img.width*xScale);
	let heightScaled = Math.floor(img.height*yScale);
	let temp = imageHolderCanvas.createImageData(widthScaled, heightScaled);
	for(let y=0;y<heightScaled;y++)
	for(let x=0;x<widthScaled;x++)
	{
		let index = (Math.floor(y/yScale)*img.width+Math.floor(x/xScale))*4;
		let indexScaled = (y*widthScaled+x)*4;
		temp.data[indexScaled] = img.data[index];
		temp.data[indexScaled+1] = img.data[index+1];
		temp.data[indexScaled+2] = img.data[index+2];
		temp.data[indexScaled+3] = img.data[index+3];
	}
	return temp;
}
function zoom(img, z)
{
	return scale(img, z, z);
}

function merge(img1, img2)
{
	if(img1.data.length!=img2.data.length)return img1;
	let temp = imageHolderCanvas.createImageData(img1.width, img1.height);
	for(let i=0;i<img1.data.length;i+=4)
	{
		if(img2.data[i+3]==0)
		{
			temp.data[i] = img1.data[i];
			temp.data[i+1] = img1.data[i+1];
			temp.data[i+2] = img1.data[i+2];
			temp.data[i+3] = img1.data[i+3];
		}
		else
		{
			temp.data[i] = img2.data[i];
			temp.data[i+1] = img2.data[i+1];
			temp.data[i+2] = img2.data[i+2];
			temp.data[i+3] = img2.data[i+3];
		}
	}
	return temp;
}

function clone(img)
{
	let temp = imageHolderCanvas.createImageData(img.width,img.height);
	for(let i=0;i<img.data.length;i++)
		temp.data[i] = img.data[i];
	return temp;
}
