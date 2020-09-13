/* jshint node: true */
'use strict';

// Transforms the request reading any arguments sent, placing restrictions on those
// this acts like a filter, requests are processed and transformed here before they
// go further through the process. This doesn't do any image processing.


const querystring = require('querystring');

// defines the allowed dimensions, default dimensions and how much variance from allowed
// dimension is allowed.

// requests look like this:
// sub.domain.tld/uuid/filename.ext?

// Parameters
// w (width)  =
// h (height) =
// t (transform) = string value "crop" or "fit" (defaults to crop, both width and height required)
// q (quailty) = string value "l" or "m" or "h" (low, medium, high)

// If o is specified, the original image is returned

// if w or h is specified, but not both, the image will be scaled to match the dimension specified with the integer provided

// if both w and h are specified and t is anything other than fit the image will be resized to match the smaller dimension
// then the other dimension will be cropped to the integer provided

// if both w and h are specified and t is fit then the image will be resized to fit within the dimensions provided.

const variables = {
        allowedDimension : [ 16, 64, 240, 360, 640, 960, 1280, 1920],
        defaultDimension : 360,
        variance: 20,
        defaults: {quality:'m',transform:'c'},
        webpExtension: 'webp'
  };

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // parse the querystrings key-value pairs.
    const params = querystring.parse(request.querystring);
    // fetch the uri of original image
    let fwdUri = request.uri;

    let width, height, transform, quality, mode;

    if(!params.w && !params.h){
        callback(null, request);
        return;
    }

    width = params.w;
    height = params.h;
    transform = params.t;
    quality = params.q;

    //Limit transform methods and set default
    switch(transform){
        case "f":
            transform = "f";
            break;
        default:
            transform = variables.defaults.transform;
    }

    // Limit quality settings and set default
    switch(quality){
        case "l":
            quality = "l";
            break;
        case "m":
            quality = "m";
            break;
        case "h":
            quality = "h";
            break;
        default:
            quality = variables.defaults.quality;
    }

    // What processing was requested?
    if(width && height){
        mode = transform;
    }else if(width){
        mode = "w";
    }else if(height){
        mode = "h";
    }else{
        mode = variables.defaults.transform;
    }

    // parse the prefix, image name and extension from the uri.

    const match = fwdUri.match(/(.*)\/(.*)\.(.*)/);

    let prefix = match[1];
    let imageName = match[2];
    let extension = match[3];

    // read the accept header to determine if webP is supported.
    let accept = headers['accept']?headers['accept'][0].value:"";

    let url = [];
    // build the new uri to be forwarded upstream
    url.push(prefix);
    url.push(mode);

    // TODO: ROUND AND LIMIT WIDTH AND HEIGHT VALUES!!
    switch(mode){
        case "w":
            url.push(matchDimension(width, variables.defaultDimension, variables.allowedDimension));
            break;
        case "h":
            url.push(matchDimension(height, variables.defaultDimension, variables.allowedDimension));
            break;
        default:
            url.push(`${matchDimension(width, variables.defaultDimension, variables.allowedDimension)}x${matchDimension(height, variables.defaultDimension, variables.allowedDimension)}`);
    }

    url.push(quality);
  
    // check support for webp
    if (accept.includes(variables.webpExtension)) {
        url.push(variables.webpExtension);
    }
    else{
        let format = extension.toLowerCase();
        if(format ==  "jpg"){
            format = "jpeg";
        }
        url.push(format);
    }
    url.push(imageName+"."+extension);

    fwdUri = url.join("/");

    // final modified url is of format /uuid/w/600/webp/image.jpg
    // examples:
    // /uuid/w/300/l/jpg/image.jpg
    // /uuid/h/500/m/webp/image.jpg
    // /uuid/f/600x400/h/jpg/image.jpg
    // /uuid/c/100x100/l/jpg/image.jpg
    request.uri = fwdUri;
    callback(null, request);
};

function round_and_limit(value, low_limit, high_limit, rounding_value){
    let roundvalue = Math.round((value)/rounding_value)*rounding_value;
    
    if(roundvalue < low_limit) return low_limit;
    if(roundvalue > high_limit) return high_limit;

    return roundvalue;
}

function matchDimension(value, defaultSize, allowedDimension) {
    let variancePercent = 0.2;
    let matchFound = false;
    let targetValue = value;

    for (let dimension of allowedDimension) {
        let min = dimension - (dimension * variancePercent);
        let max = dimension + (dimension * variancePercent);
        if(targetValue >= min && targetValue <= max){
            targetValue = dimension;
            matchFound = true;
            break;
        }
    }
    if (!matchFound) {
        targetValue = defaultSize;
    }
    return targetValue;
}