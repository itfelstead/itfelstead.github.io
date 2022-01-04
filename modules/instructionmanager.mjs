/**
	The InstructionManager class.

	Author: Ian Felstead
*/

"use strict";

/**
 * @namespace The algo-mission namespace
 */
var ALGO = ALGO || {};

import { MapManager } from './mapmanager.mjs';
import { AlgoMission } from '../algomission.mjs'; 	// for observer notification types

class InstructionManager {
	static TMapState = {
		NONE: 0,
		BAD: 1,
		GOOD: 2
	};

	/**
	* Supported Instructions
	*/
	static instructionConfig = Object.freeze(
		{
			NO_INSTRUCTION: -1,
			FORWARD: 1,
			BACK: 2,
			LEFT: 3,
			RIGHT: 4,
			GO: 5,
			FIRE: 6,
			PAUSE: 7,
			CLEAR: 8,
			GRID: 9,

			properties: {
				1: { displayString: "forward<p>", value: 1 },
				2: { displayString: "back<p>", value: 2 },
				3: { displayString: "left<p>", value: 3 },
				4: { displayString: "right<p>", value: 4 },
				5: { displayString: "go<p>", value: 5 },
				6: { displayString: "honk!<p>", value: 6 },
				7: { displayString: "pause..<p>", value: 7 },
				8: { displayString: "", value: 8 },
				9: { displayString: "", value: 9 }
			}
		}
	);

	/**
	* constructor
	* @class The InstructionManager class. Manages the instruction window in the game.
	*/
	constructor(gameMgr) {
		this.instructions = [];
		this.html = "<b>Instructions:<b><p>";
		this.instructionPtr = InstructionManager.instructionConfig.NO_INSTRUCTION; 	// index into this.instructions

		gameMgr.getMapManager().registerObserver(this);    	// for score change notifications	
		gameMgr.registerObserver(this); 					// for state change notifications

		this.currentHint = InstructionManager.TMapState.NONE;
	}

	// Note: called for both mapManager and gameMgr notifications
	updateTriggered(notificationType, notificationValue) {
		// console.log("InstructionManager got an event from the map, " + notificationType + ", " + notificationValue);

		if( notificationType == AlgoMission.TNotificationType.STATE_CHANGE ) {
			if( notificationValue == AlgoMission.TAppState.DEAD ) {
				this.currentHint = InstructionManager.TMapState.BAD;
			}
			else if ( notificationValue == AlgoMission.TAppState.WIN ) {
				this.currentHint = InstructionManager.TMapState.GOOD;
			}
		}
		else if( notificationType == AlgoMission.TNotificationType.SCORE_CHANGE ) {
			if( notificationValue < 0 ) {
				this.currentHint = InstructionManager.TMapState.BAD;
			}
			else {
				this.currentHint = InstructionManager.TMapState.GOOD;
			}
		}
	}

	/**
	* addInstructionWindow()
	*
	*
	*/
	addInstructionWindow() {
		var instructionDiv = document.createElement('div');

		instructionDiv.id = "instructionTextBox";
		instructionDiv.style.cssText =
			"width: 200px;" +
			"height: 200px;" +
			"left: 20px;" +
			"top: 20px;" +
			"max-height: 200px;" +
			"min-height: 200px;" +
			"border: none;" +  /* or e.g. '2px solid black' */
			"background-color: DimGray;" +
			"color: White;" +
			// we want a 50% transparent background, but not
			// transparent text, so use rgba rather than opacity.
			"background: rgba(105, 105, 105, 0.5);" +
			"overflow: auto;" +
			"position: absolute;" +
			"font: 12px arial,serif;";

		instructionDiv.style.opacity = 0.0;		// we'll set to 1 after loading

		document.body.appendChild(instructionDiv);
	}

	/**
	* setWindowOpacity()
	*
	*
	*/
	setWindowOpacity(opacity) {
		document.getElementById("instructionTextBox").style.opacity = opacity;
	}

	/**
	* updateWindow()
	*
	*
	*/
	updateWindow(scrollType) {
		document.getElementById("instructionTextBox").innerHTML = this.generateInstructionHtml();
		if (scrollType == 1) {
			this.followScroll();
		}
		else {
			this.tailScroll();
		}
	}

	/**
	* generateInstructionHtml()
	*
	*
	*/
	generateInstructionHtml() {
		var html = "<b style='color:#ffeaf8;'>Instructions</b><p>";

		var numInstructions = this.instructions.length;
		for (var i = 0; i < numInstructions; i++) {
			if (i == this.instructionPtr) {
				if (this.currentHint == InstructionManager.TMapState.BAD) 	// bad move
				{
					html += "<b><i style='color:#cc0000;' >";
				}
				else if (this.currentHint == InstructionManager.TMapState.GOOD) // good move
				{
					html += "<b><i style='color:#ffc61a;' >";
				}
				else 		// neutral move
				{
					html += "<b><i style='color:#a3ff5e;' >";
				}
			}

			var operEnum = this.instructions[i];

			html += InstructionManager.instructionConfig.properties[operEnum].displayString;

			if (i == this.instructionPtr) {
				html += " </i></b>";
			}
		}

		return html;
	}

	/**
	* tailScroll()
	*
	*
	*/
	tailScroll() {
		document.getElementById("instructionTextBox").scrollTop = document.getElementById("instructionTextBox").scrollHeight;
	}

	/**
	* followScroll()
	*
	*
	*/
	followScroll() {
		var followTop = (document.getElementById("instructionTextBox").scrollHeight / this.instructions.length) * this.instructionPtr;

		document.getElementById("instructionTextBox").scrollTop = followTop;
	}

	/**
	* clearInstructions()
	*
	*
	*/
	clearInstructions() {
		this.instructionPtr = InstructionManager.instructionConfig.NO_INSTRUCTION;
		this.instructions = [];
		this.currentHint = InstructionManager.TMapState.NONE;
	}

	/**
	* addInstruction()
	*
	*
	*/
	addInstruction(instructionName) {
		this.instructions.push(instructionName);
	}

	/**
	* isRunning()
	*
	* true if instructions are in progress, false if not.
	*/
	isRunning() {
		return (this.instructionPtr != InstructionManager.instructionConfig.NO_INSTRUCTION);
	}

	/**
	* startInstructions()
	*
	*/
	startInstructions() {
		this.instructionPtr = 0;  // point to 1st instruction
	}

	/**
	* currentInstruction()
	*
	*
	*/
	currentInstruction() {
		return this.instructions[this.instructionPtr];
	}

	/**
	* currentInstruction()
	*
	*
	*/
	nextInstruction() {
		this.instructionPtr++;
		// console.log("nextInstruction; ", this.instructionPtr);
		if (this.instructionPtr >= this.instructions.length) {
			this.instructionPtr = InstructionManager.instructionConfig.NO_INSTRUCTION;
			return undefined;
		}

		return this.instructions[this.instructionPtr];
	}

	/**
	* numInstructions()
	*
	*
	*/
	numInstructions() {
		return this.instructions.length;
	}
}

export { InstructionManager };