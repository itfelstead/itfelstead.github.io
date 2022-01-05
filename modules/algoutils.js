/**
    AlgoUtils

    Author: Ian Felstead
*/

"use strict";

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

// Global Namespace
var ALGO = ALGO || {};

function getBestSelectMapScreenWidth( distance, aspect, fov ) {

    let screenHeight = getScreenHeightAtCameraDistance( distance, fov );

    // We want enough vertical space for, say, 2 maps high (so we can add arrows)
    // so limit the aspect ratio if necessary
    let screenWidth = screenHeight * Math.min( 1.5, aspect );
    
    return screenWidth;
}

function getScreenWidthAtCameraDistance( distance, height, aspect ) {
    var visibleWidth = height * aspect;
    return visibleWidth;
}

function getScreenHeightAtCameraDistance( distance, fov ) {
    var vFOV = THREE.MathUtils.degToRad( fov ); // convert vertical fov to radians
    var height = 2 * Math.tan( vFOV / 2 ) * distance; 
    return height;
}

function limitViaScale( meshToLimit, meshWidth, maxWidth ) {
    const targetPercent = 100;
    if( meshWidth > maxWidth ) {
        let scale = determineScale( maxWidth, targetPercent, meshWidth);
        meshToLimit.scale.set(scale, scale, 1 );
    }
}

function determineScale( windowWidth, desiredPercentage, objectWidth ) {
    let widthAsPercentOfWindow = objectWidth / (windowWidth/100);
    let currentEffectiveScale = widthAsPercentOfWindow/100;
    let requiredScaleFor100Percent = 1 / currentEffectiveScale;
    let requiredScaleForDesiredPercent = (requiredScaleFor100Percent / 100) * desiredPercentage;
    return requiredScaleForDesiredPercent;
}

function messageToMesh( doc, msg, msgHeight, fgColour, optionalBgColour ) {
    let msgCanvas = doc.createElement("canvas");
    let context = msgCanvas.getContext("2d");
    context.font = "40px sans-serif"; 
    let border = 0.25;

    let worldMultiplier = msgHeight/40;     // i.e. font size
    let msgWidth = (context.measureText(msg).width * worldMultiplier) + border;
    let totalWidth = Math.ceil( msgWidth/ worldMultiplier);
    let totalHeight = Math.ceil( (msgHeight+border) / worldMultiplier);
    msgCanvas.width = totalWidth;
    msgCanvas.height = totalHeight;

    if (optionalBgColour != undefined) {
        context.fillStyle = "#" + optionalBgColour.toString(16).padStart(6, '0');
        context.fillRect( 0,0, totalWidth,totalHeight);
    }

    context.textAlign = "center";
    context.textBaseline = "middle"; 
    context.fillStyle = "#" + fgColour.toString(16).padStart(6, '0');
    context.font = "40px sans-serif"; 
    context.fillText(msg, totalWidth/2, totalHeight/2);
    
    let texture = new THREE.Texture(msgCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    let planeGeo = new THREE.PlaneGeometry(msgWidth, (msgHeight+border) );
    let material = new THREE.MeshBasicMaterial( { side:THREE.DoubleSide, map:texture, transparent:true, opacity:1.0 } );
    let mesh = new THREE.Mesh(planeGeo, material);
    mesh.userData.width = msgWidth;
    mesh.userData.height = (msgHeight+border);
    return mesh;
}

function calculateMeshHeight( mesh ) {
  
    var boundingBox = new THREE.Box3().setFromObject(mesh);
    const boxSize = new THREE.Vector3();
    boundingBox.getSize( boxSize );

    return boxSize.y;
  }


export { calculateMeshHeight, getScreenWidthAtCameraDistance, getScreenHeightAtCameraDistance, limitViaScale, determineScale, messageToMesh, getBestSelectMapScreenWidth };