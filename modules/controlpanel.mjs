/**
	The ControlPanel class.

	Author: Ian Felstead
*/

"use strict";

/**
 * @namespace The algo-mission namespace
 */
var ALGO = ALGO || {};

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

import { InstructionManager } from './instructionmanager.mjs';
import { limitViaScale } from './algoutils.js'; 	        // utility functions

class ControlPanel {

	/**
	* constructor
	* @class The ControlPanel class.
	*/
	constructor( camera ) {
		this.controlPanelObjects = {}; // an array of buttons (meshes)

		this.controlPanelGroup = null;
		this.panelCamera = camera;
	}

	/**
	* update()
	*
	*
	*/
	update(timeElapsed) {
		// NOOP - any animation?
	}
	
	/**
	* createControlPanel()
	*
	*
	*/
	createControlPanel(instructionMgr, textureLoader, screenWidth, screenHeight, distanceFromCamera ) {
		if( this.controlPanelGroup != null ) {
			console.log("Warning: control panel already exists");
			return;
		}

		this.controlPanelGroup = new THREE.Group();

		// Layout is something like this (x grows left, y grows up)
		//
		//                 [forward]
		//           [left] [pause] [right]
		//    [fire]        [back]
		//           [clear][grid][go]
		//
		var boxSize = 1; 	// for display size is irrelevant as FoV will alter to fill window
		var gridSize = 4; 	// panel buttons are placed on a 4x4 grid
		var defaultZ = 1;
		var stepSize = boxSize * 1.25;
		var gridOffset = (-(gridSize * stepSize) / 2) + (boxSize / 2);

		var panelConfig = [
			{ "id": InstructionManager.instructionConfig.FORWARD, "x": 1, "y": 3, "z": defaultZ, "pic": "Up256.png" },
			{ "id": InstructionManager.instructionConfig.BACK, "x": 1, "y": 1, "z": defaultZ, "pic": "Back256.png" },
			{ "id": InstructionManager.instructionConfig.LEFT, "x": 2, "y": 2, "z": defaultZ, "pic": "Left256.png" },
			{ "id": InstructionManager.instructionConfig.RIGHT, "x": 0, "y": 2, "z": defaultZ, "pic": "Right256.png" },
			{ "id": InstructionManager.instructionConfig.CLEAR, "x": 2, "y": 0, "z": defaultZ, "pic": "Clear256.png" },
			{ "id": InstructionManager.instructionConfig.GRID, "x": 1, "y": 0, "z": defaultZ, "pic": "Grid256.png" },
			{ "id": InstructionManager.instructionConfig.GO, "x": 0, "y": 0, "z": defaultZ, "pic": "Go256.png" },
			{ "id": InstructionManager.instructionConfig.FIRE, "x": 3, "y": 1, "z": defaultZ, "pic": "Fire256.png" },
			{ "id": InstructionManager.instructionConfig.PAUSE, "x": 1, "y": 2, "z": defaultZ, "pic": "Stop256.png" }
		];

		for (var i = 0; i < panelConfig.length; i++) {
			var buttonConfig = panelConfig[i];
			var picture = buttonConfig.pic;
			var texture = textureLoader.load("textures/" + picture);

			var buttonGeo = new THREE.PlaneGeometry(boxSize,boxSize);
			var buttonMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent:true, opacity:1.0 });
			var buttonMesh = new THREE.Mesh(buttonGeo, buttonMaterial);
			buttonMesh.name = buttonConfig.id;
			buttonMesh.position.set(-(gridOffset + (buttonConfig.x * stepSize)), gridOffset + (buttonConfig.y * stepSize), -distanceFromCamera);
			
			this.controlPanelGroup.add( buttonMesh );
		}

		const box = new THREE.Box3( ).setFromObject( this.controlPanelGroup );
		const size = box.getSize( new THREE.Vector3( ) );

		if( size.x*3 > screenWidth ) {
			// Screen is small (less than 3 panels wide), so best to place it centrally at bottom of the screen
			limitViaScale( this.controlPanelGroup, size.x, screenWidth/2 );
			this.controlPanelGroup.position.set( 0, -( (screenHeight/2.5) - (size.y*this.controlPanelGroup.scale.y)/2) );
		}
		else {
			// Screen is large enough to shove the controls on the left
			this.controlPanelGroup.position.set( -( (screenWidth/2) - ((size.x*this.controlPanelGroup.scale.x)/2) ), 0 );
		}
	}

	addButtons( camera ) {
		// TODO - animation
		camera.add( this.controlPanelGroup );		
	}

	removeButtons( camera ) {
		// TODO - animation
		camera.remove( this.controlPanelGroup  );
	}

	getActiveButtons() {
		return this.controlPanelGroup.children;
	}
}

export { ControlPanel };