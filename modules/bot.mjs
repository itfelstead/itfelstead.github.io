/**
  The Bot class.

  Author: Ian Felstead
*/

"use strict";

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

import { InstructionManager } from "./instructionmanager.mjs";
import { MapManager } from "./mapmanager.mjs";
import { AlgoMission } from "../algomission.mjs";

/**
 * @namespace The algo-mission namespace
 */
var ALGO = ALGO || {};

class Bot {
  OP_TIME_STEP = 2; 			// time in secs to execute an instruction
  OP_DEATH_TIME_STEP = 4;
  OP_DELAY = 0.5; 			// delay between operations
  ROTATE_STEP = 90 * Math.PI / 180; 	// Turn by 90 degrees (in radians)

  static TState = {
    INITIAL: 1,
    READY: 2,
    WAITING: 3,
    EXECUTING: 4,
    DYING: 5,
    DEAD: 6
  };

  static TDeathSpin = {
    UNKNOWN: 0,
    LEFT: 1,
    RIGHT: 2,
    BACK: 3,
    FORWARDS: 4
  };

  static TBotMapState = {
    NONE: 0,
    BAD: 1,
    GOOD: 2
  };

  /**
  * constructor
  * @class The bot class. Represents the main character in the game.
  * @param gameMgr - AlgoMission object
  */
  constructor( gameMgr ) { //instructionMgr, mapManager) {

    // Bot uses the game manager to;
    //  - get the instruction manager to understand instructions
    //  - get the map manager for tile collision awareness
    //  - pass to tiles, in case they need access to the camera etc..
    //
    this.gameMgr = gameMgr;

    this.gameMgr.registerObserver(this);    // to monitor for death state change

    this.audioBusHorn = null;
    this.audioBusMove = null;
    this.audioBusFall = null;
    this.audioBusTurn = null;
    this.audioBusWait = null;

    //this.raycaster = new THREE.Raycaster();
  
    this.mesh = null;

    this.modelLength = 0;
    this.stepSize = 0;  		// units to move by (over OP_TIME_STEP seconds). Will update based on bot length

    this.rotationOnRoad = 0;       // Amount to rotate in particular update
    this.moveOnRoad = 0;     // Amount to move in particular update
    this.rotationInFall = 0;
    this.moveInFall = 0;
    this.scale = 0;         // for shrinking and growing the bus

    this.instructionTimer = 0;	// how long each instruction should take

    this.deathTime = 0;

    this.respawn = false;

    this.instructionReady = 0;  // 1 if there is an instruction waiting for us
    this.isLoaded = 0;          // 1 if bot is loaded and ready

    this.state = Bot.TState.INITIAL;

    this.botMapStatus = Bot.TBotMapState.NONE;
  }

  updateTriggered(notificationType, notificationValue) {
		if( notificationType == AlgoMission.TNotificationType.STATE_CHANGE ) {
			if( notificationValue == AlgoMission.TAppState.DEAD ) {
				this.botMapStatus = Bot.TBotMapState.BAD;
			}
			else if ( notificationValue == AlgoMission.TAppState.WIN ) {
				this.botMapStatus = Bot.TBotMapState.GOOD;
			}
		}
  }

  /**
  * calculateStepSize()
  * Updates the modelLength member with  the length of the bot.
  * Useful in calculating movement step size on the grid.
  */
  calculateStepSize() {
    var tileBorder = 4;

    var boundingBox = new THREE.Box3().setFromObject(this.mesh);
    const boxSize = new THREE.Vector3();
    boundingBox.getSize( boxSize );

    this.modelLength = boxSize.z;
    this.stepSize = this.modelLength + (tileBorder * 2);
  }

  /**
  * load()
  * Loads the model using the supplied loaders.
  * Calls isCreatedCallback() once complete.
  *
  * @param {string} model - file name of GLTF model
  * @param {(THREE Sample)GLTFLoader} glTFLoader - GLTF loader
  * @param {function} isCreatedCallback - callback to call when complete
  */
  load(model, glTFLoader, audioListener, isCreatedCallback) {
    this.loadModel(model, glTFLoader, isCreatedCallback);

    this.loadAudio(audioListener);

    this.waitForLoad(isCreatedCallback, this);
  }

  loadModel(model, glTFLoader, isCreatedCallback) {
 
    var instance = this; 	// so we can access bot inside anon-function
    glTFLoader.load(model, function (obj) {

      var object3d  = obj.scene.getObjectByName( "OSG_Scene" );
      // Scale is OK as loaded, but to change; object3d.scale.set(100, 100, 100);

      instance.mesh = object3d;

      instance.calculateStepSize();
    });
  }

  loadAudio(audioListener) {
    var loader = new THREE.AudioLoader();

    var instance = this; 	// so we can access bot inside anon-function

    loader.load('audio/43801__daveincamas__modelahorn.wav',
      function (audioBuffer) {
        //on load
        instance.audioBusHorn = new THREE.Audio(audioListener);
        instance.audioBusHorn.setBuffer(audioBuffer);
      }
    );
    loader.load('audio/86044__nextmaking__bus.wav',
      function (audioBuffer) {
        //on load
        instance.audioBusMove = new THREE.Audio(audioListener);
        instance.audioBusMove.setBuffer(audioBuffer);
      }
    );
    loader.load('audio/86044__nextmaking__bus_reversed.wav',
      function (audioBuffer) {
        //on load
        instance.audioBusTurn = new THREE.Audio(audioListener);
        instance.audioBusTurn.setBuffer(audioBuffer);
      }
    );
    loader.load('audio/360662__inspectorj__falling-comedic-a.wav',
      function (audioBuffer) {
        //on load
        instance.audioBusFall = new THREE.Audio(audioListener);
        instance.audioBusFall.setBuffer(audioBuffer);
      }
    );
    loader.load('audio/333083__soundslikewillem__releasing-pressure.wav',
      function (audioBuffer) {
        //on load
        instance.audioBusWait = new THREE.Audio(audioListener);
        instance.audioBusWait.setBuffer(audioBuffer);
      }
    );
  }

  waitForLoad(isCreatedCallback, context) {
    var waitForAll = setInterval(function () {
      if (context.mesh != null &&
        context.audioBusMove != null &&
        context.audioBusTurn != null &&
        context.audioBusHorn != null &&
        context.audioBusWait != null &&
        context.audioBusFall != null) {
        clearInterval(waitForAll);
        context.isLoaded = 1;
        isCreatedCallback();
      }
    }, 100);
  }

  getStepSize() {
    return this.stepSize;
  }

  /**
  * currentInstruction()
  *
  * @return true if bot is busy, else false
  */
  isBusy() {
    return this.state == Bot.TState.EXECUTING ||
      this.state == Bot.TState.WAITING ||
      this.state == Bot.TState.DYING ||
      this.instructionReady == 1;
  }

  /**
  * actOnState()
  *
  * @param {integer} timeElapsed - Time elapsed since last update
  */
  actOnState(timeElapsed) {

    switch (this.state) {
      case Bot.TState.INITIAL:
        // Nothing to do
        break;
      case Bot.TState.READY:
        // Nothing to do
        break;

      case Bot.TState.WAITING:
        if (this.delayTimer > 0) {
          // Delay between instructions
          this.delayTimer -= timeElapsed;
        }
        break;

      case Bot.TState.EXECUTING:
        var executionTime = this.calculateMovementTime(timeElapsed);
        this.moveAccordingToInstruction(executionTime);
        break;

      case Bot.TState.DYING:
        var executionTime = this.calculateDeathTime(timeElapsed);
        this.doDeath(executionTime);
        break;
    }
  }



  /**
  * updateState()
  *
  *
  */
  updateState() {
    var newState = this.state;

    switch (this.state) {
      case Bot.TState.INITIAL:
        if (this.isLoaded == 1) {
          newState = Bot.TState.READY;
        }
        break;

      case Bot.TState.READY:
        if (this.instructionReady == 1) {
          // instruction execution triggered via prepareForNewInstruction()
          newState = Bot.TState.EXECUTING;

          this.preInstructionStart();
        }
        break;

      case Bot.TState.EXECUTING:


        if (this.instructionTimer <= 0) {
          // instruction finished so pause
          newState = Bot.TState.WAITING;
        }

        this.activateTileUnderBot();

        if (this.botMapStatus == Bot.TBotMapState.BAD) {
          newState = Bot.TState.DYING
        }

        break;

      case Bot.TState.WAITING:
        if (this.delayTimer <= 0) {
          newState = Bot.TState.READY;
        }
        break;

      case Bot.TState.DYING:
        if (this.deathTimer <= 0) {
          newState = Bot.TState.DEAD;
        }
        break;

      case Bot.TState.DEAD:
        // NOOP: Wait for call to reset to move us to Bot.TState.READY
        if (this.respawn == true) {
          newState = Bot.TState.READY;
          this.respawn = false;
        }
        break;

      case Bot.TState.INITIAL:
        // NOOP: Wait for loader to move us into Bot.TState.READY
        break;

      default:
      // NOOP
    }

    // Change state if required
    if (this.state != newState) {
      // console.log("Bot state changing from " + this.state + " to " + newState);
      this.onExitState();
      this.state = newState;
      this.onEnterState();
    }
  }

  isDead() {
    return this.state == Bot.TState.DEAD;
  }

  isDying() {
    return this.state == Bot.TState.DYING;
  }

  respawnBot() {
    this.resetBot();
    this.respawn = true;
  }


  /**
  * onEnterState()
  *
  *
  */
  onEnterState() {
    switch (this.state) {
      case Bot.TState.READY:
        this.scale = 1.0;
        break;

      case Bot.TState.EXECUTING:
        this.delayTimer = 0;
        this.instructionTimer = this.OP_TIME_STEP;
        break;

      case Bot.TState.WAITING:
        this.delayTimer = this.OP_DELAY;
        break;

      case Bot.TState.DYING:
        this.setupDeath();
        break;
    }
  }

  /**
  * handleInstructionStartAudio()
  *
  *
  */
  preInstructionStart() {
    var currentOp = this.gameMgr.getInstructionMgr().currentInstruction();

    if (currentOp == InstructionManager.instructionConfig.FIRE) {
      if (this.audioBusHorn != null) {
        this.audioBusHorn.play();
      }
    }
    else if (currentOp == InstructionManager.instructionConfig.PAUSE) {
      if (this.audioBusWait != null) {
        this.audioBusWait.play();
      }
    }
    else if (currentOp == InstructionManager.instructionConfig.LEFT ||
      currentOp == InstructionManager.instructionConfig.RIGHT) {
      if (this.audioBusTurn != null) {
        this.audioBusTurn.play();
      }
    }
    else {
      if (this.audioBusMove != null) {
        this.audioBusMove.play();
      }
    }
  }

  /**
  * setupDeath()
  *
  *
  */
  setupDeath() {
    this.deathTimer = this.OP_DEATH_TIME_STEP;
    this.deathSpin = Bot.TDeathSpin.UNKNOWN;

    this.audioBusFall.play();

    // direction of spin depends on which way we're facing 
    // AND which direction we're travelling in..

    var worldRotation = new THREE.Quaternion();
    this.mesh.getWorldQuaternion( worldRotation );
    let normYRot = worldRotation.y;

    let currentInstruction = this.gameMgr.getInstructionMgr().currentInstruction();
    let flipDirection = false;
    if( currentInstruction == InstructionManager.instructionConfig.BACK ) {
      flipDirection = true;
    }

    if(normYRot == 0 ) {
      this.deathSpin = (flipDirection ? Bot.TDeathSpin.BACK : Bot.TDeathSpin.FORWARDS);
    }
    else if( normYRot == 1 ) {
      this.deathSpin = (flipDirection ? Bot.TDeathSpin.FORWARDS : Bot.TDeathSpin.BACK);
    }
    else if( normYRot < 0 ) {
      this.deathSpin = (flipDirection ? Bot.TDeathSpin.LEFT : Bot.TDeathSpin.RIGHT);
    }
    else {
      this.deathSpin = (flipDirection ? Bot.TDeathSpin.RIGHT : Bot.TDeathSpin.LEFT);
    }
  }

  /**
  * onExitState()
  *
  *
  */
  onExitState() {
    switch (this.state) {
      case Bot.TState.INITIAL:
        // NOOP
        break;
      case Bot.TState.READY:
        this.instructionReady = 0;
        break;

      case Bot.TState.WAITING:
        this.delayTimer = 0;
        break;
      case Bot.TState.EXECUTING:
        this.instructionTimer = 0;
        // Trigger any affect on the map
        this.gameMgr.getMapManager().handleNewInstruction();   // e.g. fire and pause instructions may affect tile flair
        break;

      case Bot.TState.DYING:
        this.deathTimer = 0;
        break;

      case Bot.TState.DEAD:
        this.resetBot();
        break;
    }
  }

  resetBot() {
    this.scale = 1.0;
    this.mesh.rotation.set(0, 0, 0, 'XZY');
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.set(this.scale, this.scale, this.scale);
    this.rotationOnRoad = 0;
    this.moveOnRoad = 0;
    this.rotationInFall = 0;
    this.botMapStatus = Bot.TBotMapState.NONE;
  }

  /**
  * prepareForNewInstruction()
  *
  *
  */
  // This method should only be called if the bot isn't busy (isBusy())
  prepareForNewInstruction() {
    this.instructionReady = 1;
  }

  /**
  * update()
  *
  * @param {integer} timeElapsed - Time elapsed since last update
  *
  */
  update(timeElapsed) {
    this.actOnState(timeElapsed);

    this.updateState();

    this.updateMesh();
  }

  /**
  * activateTileUnderBot()
  *
  * Alert the map manager to the presence of the bot.
  * This may trigger events from the map manager
  * according to the type of tile the bot enters.
  *
  */
  activateTileUnderBot() {
    var x = this.mesh.position.x;
    var y = this.mesh.position.y + 1; // bot is at same y pos as tiles so raise
    var z = this.mesh.position.z;

    this.gameMgr.getMapManager().activateTileUnderPos(x, y, z );  
  }

  /**
  * calculateMovementTime()
  *
  * @param {integer} timeElapsed - Time elapsed since last update
  *
  */
  calculateMovementTime(timeElapsed) {
    var movementTime = 0;

    if (timeElapsed >= this.instructionTimer) {
      // Out of time in this step
      movementTime = this.instructionTimer;   // use up remaining
      this.instructionTimer = 0;
    }
    else {
      movementTime = timeElapsed;
      this.instructionTimer = this.instructionTimer - timeElapsed;
    }

    return movementTime;
  }

  calculateDeathTime(timeElapsed) {
    var movementTime = 0;

    if (timeElapsed >= this.deathTimer) {
      // Out of time in this step
      movementTime = this.deathTimer;   // use up remaining
      this.deathTimer = 0;
    }
    else {
      movementTime = timeElapsed;
      this.deathTimer = this.deathTimer - timeElapsed;
    }

    return movementTime;
  }

  doDeath(movementTime) {
    var fallSpeed = this.stepSize * 4;

    // drop down, shrink and rotate
    var movementThisFrame = movementTime * (fallSpeed / this.OP_TIME_STEP);

    var rotationThisFrame = movementTime * (this.ROTATE_STEP / this.OP_TIME_STEP);

    // shrink 100% in this.deathTimer ms
    var shrinkageThisFrame = movementTime * (1.0 / this.OP_DEATH_TIME_STEP);

    this.moveInFall = -movementThisFrame;
    this.rotationInFall += rotationThisFrame;
    this.scale = this.scale - shrinkageThisFrame;
    if (this.scale < 0) {
      this.scale = 0;
    }
    // console.log( "shrinkage = " + this.scale);
  }

  /**
  * moveAccordingToInstruction()
  *
  * @param {integer} movementTime - Time to spend moving
  */
  moveAccordingToInstruction(movementTime) {
    var currentOp = this.gameMgr.getInstructionMgr().currentInstruction();

    if (currentOp == InstructionManager.instructionConfig.FORWARD ||
      currentOp == InstructionManager.instructionConfig.BACK) {
      var movementThisFrame = movementTime * (this.stepSize / this.OP_TIME_STEP);

      if (currentOp == InstructionManager.instructionConfig.FORWARD) {
        this.moveOnRoad = movementThisFrame;
      }
      else {
        this.moveOnRoad = -movementThisFrame;
      }
    }
    else if (currentOp == InstructionManager.instructionConfig.LEFT ||
      currentOp == InstructionManager.instructionConfig.RIGHT) {
      var rotationThisFrame = movementTime * (this.ROTATE_STEP / this.OP_TIME_STEP);

      if (currentOp == InstructionManager.instructionConfig.LEFT) {
        this.rotationOnRoad += rotationThisFrame;
      }
      else {
        this.rotationOnRoad -= rotationThisFrame;
      }
    }
  }

  /**
  * updateMesh()
  *
  *
  */
  // updateMesh according to rotation and move values
  updateMesh() {
    if (this.mesh != null && typeof (this.mesh) != "undefined") {
      var x = 0.0;
      var y = this.rotationOnRoad;
      var z = 0.0;

      if (this.state == Bot.TState.DYING) {

        if (this.deathSpin == Bot.TDeathSpin.LEFT) {
          z = -this.rotationInFall;
        }
        else if (this.deathSpin == Bot.TDeathSpin.RIGHT) {
          z = this.rotationInFall;
        }
        else if (this.deathSpin == Bot.TDeathSpin.BACK) {
          x = -this.rotationInFall;
        }
        else if (this.deathSpin == Bot.TDeathSpin.FORWARD) {
          x = this.rotationInFall;
        }

        this.mesh.scale.set(this.scale, this.scale, this.scale);
      }

      this.mesh.rotation.set(x, y, z, 'XZY');

      if (this.moveOnRoad != 0) {
        this.mesh.translateZ(this.moveOnRoad);

        this.moveOnRoad = 0; 		// we moved, so reset
      }

      if (this.moveInFall != 0) {
        // Don't translateY as 'down' changes depending on orientation of object
        // instead we need to move along world Y via position
        this.mesh.position.y = this.mesh.position.y + this.moveInFall;
        this.moveInFall = 0; 		// we moved, so reset
      }
    }
  }
}

export { Bot };