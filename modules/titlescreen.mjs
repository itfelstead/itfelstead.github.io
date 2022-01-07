/**
    TitleScreen

    Author: Ian Felstead
*/

"use strict";

// Global Namespace
var ALGO = ALGO || {};

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

import { boundedScaleTo, messageToMesh, limitViaScale, determineScale, getScreenHeightAtCameraDistance, getScreenWidthAtCameraDistance } from './algoutils.js'; 	        // utility functions

class TitleScreen {

    static SMILEY = "\uD83D\uDE00";
    static BUSSTOP = "\uD83D\uDE8F";
    static BUS = "\uD83D\uDE8C";
    static BIRD = "\uD83D\uDC26";
    static NOENTRY = "\u26D4";
    static COLLISION = "\uD83D\uDCA5";

    constructor() {
        this.objectsToCleanUp = [];
    }

    create( camera, botMesh ) {

        const tips = [
            TitleScreen.BIRD + "Use your horn to scare off any nearby birds!" + TitleScreen.BIRD,
            TitleScreen.BUSSTOP + "Remember to use the bus stop button to make the bus wait at stops!" + TitleScreen.BUSSTOP,
            TitleScreen.NOENTRY + "Don't be afraid to experiment - you can always retry!" + TitleScreen.NOENTRY,
            TitleScreen.COLLISION + "No people or birds are harmed in this game! It's OK if you don't get it right " + TitleScreen.SMILEY,
            TitleScreen.COLLISION + "Don't be afraid of making mistakes: Making mistakes is how you learn!" + TitleScreen.SMILEY,
            TitleScreen.BIRD + "You get lots of points for using the horn to warn the birds!" + TitleScreen.BIRD,
            TitleScreen.BUSSTOP + "You might lose points if you use the horn near a person waiting to be picked up..." + TitleScreen.BUSSTOP
        ];

        let distanceFromCamera = 10;
        const screenHeight = getScreenHeightAtCameraDistance( distanceFromCamera, camera.fov );
        const screenWidth = getScreenWidthAtCameraDistance( distanceFromCamera, screenHeight, camera.aspect );

        // TITLE TEXT
        let titleMsgMesh = this.prepareMsgObject( camera, "Algo-mission ", "titleMsg", 1, 0xFFFFFF, screenWidth, 100 );
        let titleBotMesh = this.prepareBot( camera, titleMsgMesh, botMesh, "titleMsg_bot" );

        let yPos = (screenHeight/2) - (titleMsgMesh.userData.height*titleMsgMesh.scale.y);
        this.animateMsg( titleBotMesh, titleMsgMesh, screenWidth, yPos, -distanceFromCamera );

        yPos -= (titleMsgMesh.userData.height*titleMsgMesh.scale.y) / 2;
        const urlDelay = 2000;
        let name = "urlMsg";
        let urlMsgMesh = this.prepareMsgObject( camera, "(https://github.com/itfelstead/algo-mission)", name, 0.25, 0xFFFFFF, screenWidth, 30 );
        this.simpleDisplayMsg( urlDelay, urlMsgMesh, yPos, -distanceFromCamera );

        const titlePadding = (titleMsgMesh.userData.height*titleMsgMesh.scale.y);
        let remainingHeight = screenHeight - (titleMsgMesh.userData.height*titleMsgMesh.scale.y) - titlePadding;
        

        // info #
        const infoDelayMs = 2000;
        yPos -= titlePadding;
        name = "info1Msg";
        let info1MsgMesh = this.prepareMsgObject( camera, "Mission: Can you tell the bus exactly how to get to the bus stop?", name, 0.5, 0xFFFFFF, screenWidth, 60 );
        this.simpleDisplayMsg( infoDelayMs, info1MsgMesh, yPos, -distanceFromCamera );

        let padding = (info1MsgMesh.userData.height*info1MsgMesh.scale.y)+2 ;
        yPos -= ((info1MsgMesh.userData.height*info1MsgMesh.scale.y) + padding);

        // tip
        const tipDelayMs = 7000;
        let tipIdx = Math.floor(Math.random() * tips.length);
        name = "tip";
        let tipMsgMesh = this.prepareMsgObject( camera, "Tip: " + tips[tipIdx], name, 0.33, 0xFFFFFF, screenWidth, 40 );
        let tipBotMesh = this.prepareBot( camera, tipMsgMesh, botMesh, name + "_bot" );
        this.animateMotivationMsg( tipDelayMs, tipBotMesh, tipMsgMesh, screenWidth, yPos, -distanceFromCamera );

        // click to continue
        padding = (tipMsgMesh.userData.height*tipMsgMesh.scale.y);
        yPos -= ((tipMsgMesh.userData.height*tipMsgMesh.scale.y) + padding);
        const clickDelayMs = 2000;
        let clickMsgMesh = this.prepareMsgObject( camera, TitleScreen.SMILEY + "Click to continue" + TitleScreen.SMILEY, name, 0.5, 0xFFFFFF, screenWidth, 40 );

        yPos = -((screenHeight/2) - (clickMsgMesh.userData.height*clickMsgMesh.scale.y));
        let clickBotMesh = this.prepareBot( camera, clickMsgMesh, botMesh, name + "_bot" );
        this.animateMotivationMsg( clickDelayMs, clickBotMesh, clickMsgMesh, screenWidth, yPos, -distanceFromCamera );

    }
 
    animateMotivationMsg( delayMs, botMesh, msgMesh, screenWidth, yPos, zPos ) {
        setTimeout(this.animateMsg.bind(this, botMesh, msgMesh, screenWidth, yPos, zPos), delayMs);
    }

    simpleDisplayMsg( delayMs, msgMesh, yPos, zPos ) {
        setTimeout(this.animateSimpleMsg.bind(this, msgMesh, yPos, zPos), delayMs);
    }

    animateSimpleMsg( msgMesh, yPos, zPos ) {
        msgMesh.position.set( 0, yPos, zPos );
        msgMesh.visible = true;
    }

    animateMsg( botMesh, msgMesh, screenWidth, yPos, zPos ) {

        const effectiveBotWidth = botMesh.userData.depth*botMesh.scale.z;
        let botStart = (screenWidth / 2) + (effectiveBotWidth/2);
        let msgStart = botStart + (effectiveBotWidth/2) + ((msgMesh.userData.width*msgMesh.scale.x)/2);

        botMesh.visible = true;
        msgMesh.visible = true;

        botMesh.position.set( -botStart, yPos - ((msgMesh.userData.height*msgMesh.scale.y)/2), zPos );
        msgMesh.position.set( -msgStart, yPos, zPos );

        let animDelayMs = 10;
        let moveStep = 0.2;

        this.moveAcrossScreen( botMesh, msgMesh, animDelayMs, moveStep, screenWidth );
    }

    moveAcrossScreen( botMesh, msgMesh, animDelayMs, moveStep, screenWidth ) {

        // Stop moving the msgMesh when x >= 0 (i.e. drop it in middle of screen)
        if( msgMesh.position.x < 0 ) {
            msgMesh.position.x += moveStep;
        }

        // Stop moving and remove the botMesh when x > screenWidth + bot depth/2 (i.e. bot off screen)
        // Stop animation when bot off screen
        if( botMesh.position.x <= ( screenWidth + (botMesh.userData.depth/2) ) ) {
            botMesh.position.x += moveStep;
            setTimeout(this.moveAcrossScreen.bind(this, botMesh, msgMesh, animDelayMs, moveStep, screenWidth), animDelayMs);
        }
    }

    prepareMsgObject( camera, text, name, size, colour, screenWidth, percentOfWidth ) {

        let mesh = messageToMesh(document, text, size, colour, undefined );
        mesh.name = name;
        // scale msg to fit the screen.... but don't stretch it beyond 2.5 times

        let scale = boundedScaleTo( screenWidth, 2.5, mesh.userData.width );

        mesh.scale.set( scale, scale, 1 );
        mesh.visible = false;
 
        camera.add(mesh);
        this.objectsToCleanUp.push(mesh.name);

        return mesh;
    }

    prepareBot( camera, associatedMsgMesh, botMesh, name ) {
        // Add a suitably sized bus mesh 
        let botMsgCopy = botMesh.clone(); 
        botMsgCopy.name = name;
        botMsgCopy.rotateY(Math.PI/2);  // make bot face right

        let botHeight = botMsgCopy.userData.height;

        let botHeightAsPercentOfMsgHeight = 150;
        let botScale = determineScale( (associatedMsgMesh.userData.height * associatedMsgMesh.scale.y), botHeightAsPercentOfMsgHeight, botHeight );
        botMsgCopy.scale.set( 0.01, botScale, botScale );   // note: keep bot flat by making x scale small
        botMsgCopy.visible = false;

        camera.add( botMsgCopy );
        this.objectsToCleanUp.push(botMsgCopy.name);

        return botMsgCopy;
    }

    destroy( camera ) {
        for( let i=0; i < this.objectsToCleanUp.length; ++i ) {
            let obj = camera.getObjectByName( this.objectsToCleanUp[i] );
            if( obj ) {
                camera.remove( obj );
            }
        }
    }
}

export { TitleScreen };