/**
    The main class, AlgoMission

    Author: Ian Felstead
*/

"use strict";

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.135.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.135.0/examples/jsm/controls/OrbitControls.js';

import { Bot } from './modules/bot.mjs';
import { MapManager } from './modules/mapmanager.mjs';
import { InstructionManager } from './modules/instructionmanager.mjs';
import { ControlPanel } from './modules/controlpanel.mjs';
import { ScoreManager } from './modules/scoremanager.mjs';
import { LoadingManager } from './modules/loadingmanager.mjs';

// Global Namespace
var ALGO = ALGO || {};

class AlgoMission {
 
    static VERSION = 1.0;

    static SKY_TEXTURE = "textures/sky_twilight.jpg";   // Texture taken from Optikz 2004 post on blenderartists,org

    static UPDATE_TIME_STEP = 0.033;                    // 33ms = approx 30 FPS game loop

    static TAppState = {
        INITIAL: 1,
        READY: 2,
        WAITING: 3,
        RUNNING: 4,
        WIN: 5,
        DEAD: 6,
        RETRY: 7,
        SELECTMAP: 8
    };

    // Observer notification types (central)
	static TNotificationType = {
        TILE_CHANGE:  0, 		// other param will be tile role
		SCORE_CHANGE: 1, 		// other param will be  score delta 			
		STATE_CHANGE: 2 		// other param will be  win, die
	};

    constructor() {
        this.m_State = AlgoMission.TAppState.INITIAL;

        //
        // the following are set later during game intitialisation
        //
        this.m_MapManager = null;

        // Main Screen support
        this.m_Scene = null;
        this.m_Camera = null;
        this.m_Renderer = null;
        this.m_Element = null;
        this.m_Container = null;

        // Bot
        this.m_Bot = null;

        this.m_InstructionMgr = null;

        this.m_ControlPanel = null;

        // Collision Detection
        this.m_Raycaster = null;

        // overlays a grid to help users
        this.m_GridHelperObject = null;

        this.m_MouseControls = null;

        this.m_TextureLoader = null;

        this.m_GLTFLoader = null;

        // game loop support
        this.m_Clock = null;
        this.m_Lag = 0; 	// used in game loop for fixed step update

        this.m_Retry = false;
        this.m_SelectMap = false;
        this.m_SelectedMap = -1;

        // audio support
        this.m_AudioListener = null;
        this.m_AmbientButtonClickSound = null;
        this.m_WinnerSound = null;
 
        // Winner
        this.m_Trophy = null;

        this.m_MapSelectionObjects = [];

        this.m_NextArrow = null;
        this.m_PrevArrow = null;
        this.m_ArrowLoaded = false;
        this.m_ArrowsSpinning = false;

        this.m_RetryButtonObjects = [];

        this.m_Observers = [];

        this.m_ScoreManager = null;

        this.m_LoadingManager = null;

        // These are the jobs that we need to wait for (i.e. things the loading screen covers)
        this.m_StartupLoadJobNames = [ "bot", "sky", "map",  "winner audio", "audio" ];
    }

    // called by things that want to observe us
    registerObserver(observer)
	{
		this.m_Observers.push(observer);
	}

    unregisterObserver()
	{
		this.m_Observers = this.m_Observers.filter(
			function(existingObserver) {
				if(existingObserver !== observer) {
					return existingObserver;
				}
			}
		);
	}

    notifyObservers(notificationType, notificationValue)
	{
		this.m_Observers.forEach(
			function(observer) {
				observer.updateTriggered( notificationType, notificationValue );
			}
		);
	}

    updateTriggered(notificationType, notificationValue) {
        console.log("Window got an event from the map, " + notificationType + ", " + notificationValue);
        
        switch( notificationType ) {
            case AlgoMission.TNotificationType.TILE_CHANGE:
                // If the current tile is 'no tile', then we're in the air...
                if( notificationValue == MapManager.NO_TILE ) {
                    // Tell the bot the bad news... this in turn will trigger out own state change (once bot has finished dying)
                    this.notifyObservers( AlgoMission.TNotificationType.STATE_CHANGE, AlgoMission.TAppState.DEAD );
                }
            break;

            default:
                console.log("unsupported notification: " + notificationType );
        }
    }  

    getCamera() {
        return this.m_Camera;
    }

    getBot() {
        return this.m_Bot;
    }

    getLoadingManager() {
        return this.m_LoadingManager;
    }

    getMapManager() {
        return this.m_MapManager;
    }

    getInstructionMgr() {
        return this.m_InstructionMgr;
    }

    getScoreManager() {
        return this.m_ScoreManager;
    }

    runGame() {
        console.log("algo-mission v" + AlgoMission.VERSION + " starting...");

        this.m_State = AlgoMission.TAppState.INITIAL;
        this.initialise();

        // we listen to the map manager for tile changes
        this.m_MapManager.registerObserver(this);


        //m_State = AlgoMission.TAppState.SELECTMAP;
        this.gameLoop(); 	// intial kickoff, subsequest calls via requestAnimationFrame()
    }

    actOnState() {
        switch (this.m_State) {
            case AlgoMission.TAppState.INITIAL:
                // NOOP - should be initialised before we get here
                break;

            case AlgoMission.TAppState.READY:
                // allow user freedom to look around
                this.m_MouseControls.enabled = true;
                break;

            case AlgoMission.TAppState.RUNNING:

                if (!this.m_Bot.isBusy() && this.m_InstructionMgr.nextInstruction() != undefined) {
                    this.m_Bot.prepareForNewInstruction();      // e.g. movement instructions affect bot location
                }

                // camera must follow bot
                this.m_MouseControls.enabled = false;

                this.m_Camera.updateProjectionMatrix();
                this.m_Camera.position.set(this.m_Bot.mesh.position.x, this.m_Bot.mesh.position.y + 60, this.m_Bot.mesh.position.z - 40);
                this.m_Camera.lookAt(this.m_Bot.mesh.position);
                break;

            case AlgoMission.TAppState.WIN:
                // NOOP just wait for user to click a button
                break;

            case AlgoMission.TAppState.DEAD:
                // NOOP - we're just waiting for user to restart or choose map
                this.m_MouseControls.enabled = false;
                break;

            case AlgoMission.TAppState.RETRY:
                this.resetPlayArea();
                break;

            case AlgoMission.TAppState.SELECTMAP:
                // NOOP just wait for user to select a map
                break;
        }

        if (this.m_State != AlgoMission.TAppState.INITIAL && this.m_State != AlgoMission.TAppState.DEAD) {

            this.m_ControlPanel.update(AlgoMission.UPDATE_TIME_STEP);

            this.m_Bot.update(AlgoMission.UPDATE_TIME_STEP)

            this.m_MapManager.update(AlgoMission.UPDATE_TIME_STEP);
        }
    }

    resetPlayArea() {
        this.m_InstructionMgr.clearInstructions();
        this.m_InstructionMgr.updateWindow();

        this.m_MapManager.loadMap(this.m_SelectedMap, this.m_Scene);

        this.m_Bot.respawnBot();

        this.m_ScoreManager.resetScore();

        this.m_Camera.updateProjectionMatrix();
        this.m_Camera.position.set(this.m_Bot.mesh.position.x, this.m_Bot.mesh.position.y + 60, this.m_Bot.mesh.position.z - 40);
        this.m_Camera.lookAt(this.m_Bot.mesh.position);
    }

    updateState(timestep) {
        var newState = this.m_State;

        switch (this.m_State) {
            case AlgoMission.TAppState.INITIAL:
                if (this.m_Bot.mesh != null && typeof (this.m_Bot.mesh) != "undefined" &&
                    this.getLoadingManager().isLoaded( "map" ) == true ) {
                    newState = AlgoMission.TAppState.SELECTMAP;
                }
                break;

            case AlgoMission.TAppState.READY:
                if (this.m_InstructionMgr.isRunning()) {
                    newState = AlgoMission.TAppState.RUNNING;
                }
                break;

            case AlgoMission.TAppState.RUNNING:
                if (this.m_Bot.isDead()) {
                    newState = AlgoMission.TAppState.DEAD;

                    // record the highest score regardless of win or fail
                    this.getMapManager().applyScore( this.getScoreManager().getScore() );
                }
                else if (this.m_InstructionMgr.isRunning() == false) {
                    
                    // record the highest score regardless of win or fail
                    this.getMapManager().applyScore( this.getScoreManager().getScore() );

                    if( this.m_MapManager.isCurrentMapComplete() ) {
                        this.notifyObservers( AlgoMission.TNotificationType.STATE_CHANGE, AlgoMission.TAppState.WIN )
                        newState = AlgoMission.TAppState.WIN;
                    }
                    else {
                        // Must complete with a single instruction set, so failed
                        newState = AlgoMission.TAppState.DEAD;
                    }
                }
                else {
                    this.m_InstructionMgr.updateWindow(1); // highlight current instruction
                }
                break;

            case AlgoMission.TAppState.WIN:
                if (this.m_SelectMap == true) {
                    newState = AlgoMission.TAppState.SELECTMAP;
                    this.m_SelectMap = false;
                }
                break;

            case AlgoMission.TAppState.DEAD:
                if (this.m_Retry == true) {
                    newState = AlgoMission.TAppState.RETRY;
                    this.m_Retry = false;
                }
                else if (this.m_SelectMap == true) {
                    newState = AlgoMission.TAppState.SELECTMAP;
                    this.m_SelectMap = false;
                }
                break;

            case AlgoMission.TAppState.RETRY:
                if (!this.m_Bot.isDead()) {     // waits for bot respawn
                    newState = AlgoMission.TAppState.READY;
                }
                break;

            case AlgoMission.TAppState.SELECTMAP:
                if (this.m_SelectedMap != -1) {
                    this.resetPlayArea();
                    newState = AlgoMission.TAppState.RETRY;
                }
                break;
        }

        // Change state if required
        if (this.m_State != newState) {
            console.log("App State changing from " + this.m_State + " to " + newState);
            this.onExitState();
            this.m_State = newState;
            this.onEnterState();
        }
    }

    onEnterState() {
        switch (this.m_State) {
            case AlgoMission.TAppState.INITIAL:
                break;
            case AlgoMission.TAppState.READY:
                this.showPlayArea();
                break;
            case AlgoMission.TAppState.RUNNING:
                break;
            case AlgoMission.TAppState.WIN:
                this.displayWinnerScreen();
                break;
            case AlgoMission.TAppState.DEAD:
                this.displayDeathScreen();
                break;
            case AlgoMission.TAppState.RETRY:
                break;
            case AlgoMission.TAppState.SELECTMAP:
                this.hidePlayArea();
                this.m_MapSelectIndex = this.m_SelectedMap;     // start selection at current map
                this.displayMapScreen();
                break;
        }
    }

    onExitState() {
        switch (this.m_State) {
            case AlgoMission.TAppState.INITIAL:
                break;
            case AlgoMission.TAppState.READY:
                break;
            case AlgoMission.TAppState.RUNNING:
                break;
            case AlgoMission.TAppState.WIN:
                this.removeWinnerScreen();
                break;
            case AlgoMission.TAppState.DEAD:
                this.removeDeathScreen();
                break;
            case AlgoMission.TAppState.RETRY:
                break;
            case AlgoMission.TAppState.SELECTMAP:
                this.removeMapScreen();
                break;
        }
    }

    //
    // Initialisation
    //

    initialise() {

        this.setupBasicScene();

        this.addCamera();

        this.addLoadingManager();

        this.getLoadingManager().displayLoadingScreen();

        this.addAudio(this.m_Camera);

        this.addSky();

        this.addAmbientLight();

        this.addMouseControls();

        this.addMapManager(this.m_TextureLoader);

        this.addInstructionManager(this);

        this.addControlPanel(this.m_InstructionMgr, this.m_TextureLoader);

        this.addScoreManager();

        this.addBot(this.m_InstructionMgr, this.m_MapManager, this.botCreatedCb.bind(this));

        // We use the calculated bot length to size the tiles
        // so wait until the model has loaded and the length
        // has been calculated
        var self = this;
        var myInterval = setInterval(function () {
            if (self.getLoadingManager().isLoaded("bot") == true && self.getLoadingManager().isLoaded("map") == true) {
                // adjust map and bot step measurements according to Bot length
                self.m_MapManager.resize(self.m_Bot.getStepSize(), 0.1);
                clearInterval(myInterval);
            }
        }, 100);

        this.setupGameLoop();

        this.setupCollisionDetection();

        this.addEventListeners();

        var waitForLoad = setInterval(function () {
            if ( self.getLoadingManager().loadComplete( self.m_StartupLoadJobNames ) == true ) {

                clearInterval(waitForLoad);

                self.getLoadingManager().removeLoadingScreen();

                self.toggleGridHelper();

                self.m_ScoreManager.createScore();
            }
        }, 100);
    }

    hidePlayArea() {
        this.m_ControlPanel.removeButtons( this.m_Camera );
        this.m_Scene.remove(this.m_Bot.mesh);
        this.m_ScoreManager.hideScore( this.m_Camera );
    }

    showPlayArea() {
        this.m_ScoreManager.showScore( this.m_Camera );
        this.m_Scene.add(this.m_Bot.mesh);
        this.m_ControlPanel.addButtons( this.m_Camera );
    }

    setupGameLoop() {
        this.m_Clock = new THREE.Clock();

        this.m_Lag = 0;
    }

    setupBasicScene() {
        this.m_Renderer = new THREE.WebGLRenderer();
        this.m_Element = this.m_Renderer.domElement;
        this.m_Container = document.getElementById('AlgoMission');
        this.m_Container.appendChild(this.m_Element);

        this.m_TextureLoader = new THREE.TextureLoader();

        this.m_GLTFLoader = new GLTFLoader();

        this.m_Scene = new THREE.Scene();
    }

    addCamera() {
        this.m_Camera = new THREE.PerspectiveCamera(90, 1, 0.001, 1700);
        // look over bots shoulder
        this.m_Camera.position.set(0, 60, -40);
        this.m_Camera.lookAt(new THREE.Vector3(0, 0, 0));
        this.m_Scene.add(this.m_Camera);

        this.handleResize();    // make sure camera is using current window size
    }

    addMouseControls() {
        this.m_MouseControls = new OrbitControls(this.m_Camera, this.m_Element);

        // Rotate about the center.
        this.m_MouseControls.target.set(0, 0, 0);

        // Future note: If you wanted a VR like rotation then change
        // to rotate about camera position (plus a small offset) instead
        // and turn off pan/zoom. e.g.
        //m_MouseControls.target.set( this.m_Camera.position.x+0.1, this.m_Camera.position.y, this.m_Camera.position.z );
        //m_MouseControls.noZoom = true;
        //m_MouseControls.noPan = true;
    }

    addAmbientLight() {
        var white = 0xA0A0A0;
        this.m_Scene.add(new THREE.AmbientLight(white));
    }

    addSky() {
        var skyGeo = new THREE.SphereGeometry(500, 60, 40);
        skyGeo.scale(- 1, 1, 1);

        var self = this;
        this.m_TextureLoader.load(AlgoMission.SKY_TEXTURE,

            // on load
            function (texture) {
                var material = new THREE.MeshBasicMaterial({ map: texture });
                var mesh = new THREE.Mesh(skyGeo, material);
                self.m_Scene.add(mesh);

                self.getLoadingManager().markJobComplete("sky");
            },
            // on download progress
            function (xhr) {
                //console.log( AlgoMission.SKY_TEXTURE + " " + (xhr.loaded / xhr.total * 100) + '% loaded' );
            },
            // on error
            function (xhr) {
                //console.log( 'Error loading sky texture ' + AlgoMission.SKY_TEXTURE );
            }
        );
    }

    addAudio(camera) {

        this.m_AudioListener = new THREE.AudioListener();
        camera.add(this.m_AudioListener);

        this.m_AmbientButtonClickSound = new THREE.Audio(this.m_AudioListener);
        this.m_Scene.add(this.m_AmbientButtonClickSound);

        var loader = new THREE.AudioLoader();
        var self = this;
        loader.load('audio/107132__bubaproducer__button-14.wav',
            function (audioBuffer) {
                //on load
                self.m_AmbientButtonClickSound.setBuffer(audioBuffer);
                self.getLoadingManager().markJobComplete("audio");
            }
        );

        this.m_WinnerSound = new THREE.Audio(this.m_AudioListener);
        this.m_Scene.add(this.m_WinnerSound);
        loader.load('audio/462362__breviceps__small-applause.wav',
            function (winnerAudioBuffer) {
                //on load
                self.m_WinnerSound.setBuffer(winnerAudioBuffer);
                self.getLoadingManager().markJobComplete("winner audio");
            }
        );

    }

    // calls botCb() when bot is ready
    addBot(instructionMgr, mapManager, botCb) {
        this.m_Bot = new Bot( this );//instructionMgr, mapManager);
        this.m_Bot.load("models/ToonBus_VijayKumar/scene.gltf",
            this.m_GLTFLoader,
            this.m_AudioListener,
            botCb);
    }

    botCreatedCb() {
        this.getLoadingManager().markJobComplete( "bot" );
    }


    addLoadingManager() {
        this.m_LoadingManager = new LoadingManager( this, this.m_StartupLoadJobNames );
    }

    addMapManager(textureLoader) {
        this.m_MapManager = new MapManager( this );
        var self = this;
        this.m_MapManager.load(textureLoader, this.m_GLTFLoader, 
                function () { 
                    self.getLoadingManager().markJobComplete("map");
                });
    }

    addInstructionManager(mapManager) {
        this.m_InstructionMgr = new InstructionManager(mapManager);
        this.m_InstructionMgr.addInstructionWindow();
        this.m_InstructionMgr.updateWindow();
    }

    addControlPanel(instructionMgr, textureLoader) {
        this.m_ControlPanel = new ControlPanel(this.m_Camera);

        let distanceFromCamera = 10;

		const screenHeight = this.getScreenHeightAtCameraDistance( distanceFromCamera );
        const screenWidth = this.getScreenWidthAtCameraDistance( distanceFromCamera, screenHeight );

        this.m_ControlPanel.createControlPanel(instructionMgr, textureLoader, screenWidth, screenHeight, distanceFromCamera );
    }

    addScoreManager( ) {
        this.m_ScoreManager = new ScoreManager( this.getMapManager() );
    }

    addEventListeners() {
        window.addEventListener('resize', this.handleResize.bind(this), false);
        setTimeout(this.handleResize.bind(this), 1);
    }

    displayWinnerScreen() {
        this.loadWinnerModels( this.m_GLTFLoader );
        this.waitForWinnerLoad( this.runWinnerScreen.bind(this), this );
    }

    loadWinnerModels( glTFLoader ) {
        if( this.getLoadingManager().isLoaded("trophy") == false ) {
            this.loadModel( "./models/Trophy_SyntyStudios/scene.gltf", glTFLoader, this.trophyCreatedCb.bind(this) );
        }
    }

    trophyCreatedCb( obj ) {
        var threeGroup = obj.scene;
        var object3d  = threeGroup.getObjectByName( "OSG_Scene" );
        this.m_Trophy = object3d;
        this.getLoadingManager().markJobComplete("trophy");
    }

    waitForWinnerLoad(isCreatedCallback, context) {
        var waitForAll = setInterval(function () {
          if (context.getLoadingManager().isLoaded("trophy") == true ) {
            clearInterval(waitForAll);
            isCreatedCallback();
          }
        }, 100);
    }

    loadModel(model, glTFLoader, isCreatedCallback) {
        var instance = this; 	// so we can access bot inside anon-function
        glTFLoader.load( model, 
            // Loaded    
            function (gltf) {
                isCreatedCallback(gltf);
            },
            // Progress
            function (xhr ) {
                console.log( model + " " + ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
            },
            // Error
            function( error ) {
                console.log( 'Failed to load model ' + model );
            }
        );
    }

    runWinnerScreen( ) {
 
        var instance = this;

        this.m_WinnerSound.play();

        let startZ = 1;
        this.m_Trophy.position.set( 0, -1, startZ );     // note; start behind camera (Z) for later zoom
        this.m_Camera.add(this.m_Trophy);

        let trophySpotlight = new THREE.SpotLight( 0xffffff, 1, 10 );
        trophySpotlight.position.set(0,0,1);
        trophySpotlight.target = this.m_Trophy;
        trophySpotlight.name = "trophySpotlight";
        this.m_Camera.add(trophySpotlight);
        
        let messageMesh = this.messageToMesh("Well done!", 1.25, 0x000000, undefined);
        messageMesh.position.set( 0, -4, -10 );
        messageMesh.name = "wellDoneMsg";
        this.m_Camera.add(messageMesh);

        let newMissionMesh = this.messageToMesh("(click mouse for a new mission)", 1, 0x000000, undefined);
        newMissionMesh.position.set( 0, -6, -10 );
        newMissionMesh.name = "newMissionMsg";
        
        let animDelayMs = 10;

        let finalZ = -5;
        let zoomStep = 0.1;
        (function animateTrophyZoom() {
            if( instance.m_Trophy.position.z > finalZ  ) {
                instance.m_Trophy.position.z = instance.m_Trophy.position.z - zoomStep;
                setTimeout(animateTrophyZoom, animDelayMs);
            }
        })();

        let buttonRevealDelayMs = 4000;
        (function animateTrophyClickMsg() {
            if( instance.m_State != AlgoMission.TAppState.WIN ) {
                // if user already clicked us off of the win screen, then forget it
                return;
            }

            if( buttonRevealDelayMs > 0 ) {   
                buttonRevealDelayMs -= animDelayMs;
                if( buttonRevealDelayMs <= 0 ) {
                    // Time to show the options
                    instance.m_Camera.add(newMissionMesh);
                }
                else {
                    setTimeout(animateTrophyClickMsg, animDelayMs);
                }
            }
        })();

        let rotateStep = 0.01;
        (function animateTrophySpin() {
            instance.m_Trophy.rotation.y = instance.m_Trophy.rotation.y - rotateStep;
            // Spin while on win
            if (instance.m_State == AlgoMission.TAppState.WIN ) {
                setTimeout(animateTrophySpin, animDelayMs);
            }
        })();
    }

    messageToMesh( msg, msgHeight, fgColour, optionalBgColour ) {
        let msgCanvas = document.createElement("canvas");
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

    removeWinnerScreen() {

        let missionMsg = this.m_Camera.getObjectByName("newMissionMsg");
        if( missionMsg ) {
            this.m_Camera.remove( missionMsg );
        }

        let wellDoneMsg = this.m_Camera.getObjectByName("wellDoneMsg");
        if( wellDoneMsg ) {
            this.m_Camera.remove( wellDoneMsg );
        }

        let finalZ = 1;
        let zoomStep = 0.2;
        let animDelayMs = 10;
        var instance = this;
        (function animateTrophy() {
            if( instance.m_Trophy.position.z < finalZ  ) {
                instance.m_Trophy.position.z = instance.m_Trophy.position.z + zoomStep;
                setTimeout(animateTrophy, animDelayMs);
            }
            else {
                instance.m_Camera.remove(instance.m_Trophy);

                let trophySpotlight = instance.m_Camera.getObjectByName("trophySpotlight");
                if( trophySpotlight ) {
                    instance.m_Camera.remove(trophySpotlight);
                }
            }
        })();
    }

    displayDeathScreen() {

        let distanceFromCamera = 10;
        let textHeight = 1;

        let retryMesh = this.messageToMesh("Try again?", textHeight, 0xFFFFFF, undefined);
        retryMesh.name = "retryButton";

        let chooseMapMesh = this.messageToMesh("Choose map", textHeight, 0xFFFFFF, undefined);
        chooseMapMesh.name = "chooseMapButton";

        let box = new THREE.Box3().setFromObject( retryMesh );
        let dimensions = new THREE.Vector3();
        box.getSize(dimensions);
        let retryWidth = dimensions.x;


        box = new THREE.Box3().setFromObject( chooseMapMesh );
        dimensions = new THREE.Vector3();
        box.getSize(dimensions);
    
        let screenWidth = this.getBestSelectMapScreenWidth(distanceFromCamera);

        let halfScreen = (screenWidth/2);    // as it is 0 centered
        let retryPadding = (halfScreen - retryWidth) / 2;

        retryMesh.position.set( -(halfScreen-retryPadding), 0, -distanceFromCamera );
        chooseMapMesh.position.set( retryPadding, 0, -distanceFromCamera );

        this.m_RetryButtonObjects.push(retryMesh);
        this.m_RetryButtonObjects.push(chooseMapMesh);

        this.m_Camera.add(retryMesh);
        this.m_Camera.add(chooseMapMesh);
    }

    retryMap() {
        this.m_Retry = true;
    }

    selectMap() {
        this.m_SelectMap = true;
    }

    removeDeathScreen() {
        this.removeRetryButtons();
     }

    getBestSelectMapScreenWidth( distance ) {

        let screenHeight = this.getScreenHeightAtCameraDistance( distance );

        // We want enough vertical space for, say, 2 maps high (so we can add arrows)
        // so limit the aspect ratio if necessary
        let aspect = Math.min( 1.5, this.m_Camera.aspect );

        let screenWidth = screenHeight * aspect;
        
        return screenWidth;
    }

    getScreenWidthAtCameraDistance( distance, height ) {
        var visibleWidth = height * this.m_Camera.aspect;
        return visibleWidth;
    }

    getScreenHeightAtCameraDistance( distance ) {
        var vFOV = THREE.MathUtils.degToRad( this.m_Camera.fov ); // convert vertical fov to radians
        var height = 2 * Math.tan( vFOV / 2 ) * distance; 
        return height;
    }

    displayMapScreen() {
        this.m_SelectedMap = -1;
        this.loadMapSelectModels( this.m_GLTFLoader );
        this.waitForMapSelectLoad( this.runMapSelectScreen.bind(this), this );
    }

    loadMapSelectModels( glTFLoader ) {
        if( this.m_ArrowLoaded == false ) {
            this.loadModel( "./models/Arrow_JakobHenerey/scene.gltf", glTFLoader, this.arrowCreatedCb.bind(this) );
        }
    }

    arrowCreatedCb( obj ) {
        var threeGroup = obj.scene;
        var object3d  = threeGroup.getObjectByName( "OSG_Scene" );
       // this.m_Arrow = object3d;

        object3d.scale.set(0.5, 0.5, 0.5);
        object3d.rotation.set( 0, 1.6, 0 );

        this.m_ArrowHeightOffset = this.calculateArrowHeightOffset( object3d );


        // TODO - hack for now, figure out correct way to do this
        this.m_PrevArrow = object3d.clone();
        this.m_PrevArrow.children[0].children[0].children[0].children[0].name = "mapSelectPrevArrow";
        
        // TODO - hack for now, figure out correct way to do this
        this.m_NextArrow = object3d.clone();
        this.m_NextArrow.children[0].children[0].children[0].children[0].name = "mapSelectNextArrow";

        this.m_ArrowLoaded = true;
    }
    
    calculateArrowHeightOffset( arrow ) {
        let arrowHeightOffset = 0;
        arrow.traverse( function( node ) {

            if ( node.type == "Mesh" ) { //node instanceof THREE.Mesh ) {
                const box = new THREE.Box3();
                box.copy( node.geometry.boundingBox ).applyMatrix4( node.matrixWorld );
                let arrowSize = new THREE.Vector3();
                box.getSize( arrowSize );
                arrowHeightOffset = (arrowSize.y / 2);  
            }
        } );

        return arrowHeightOffset;
    }

    waitForMapSelectLoad(isCreatedCallback, context) {
        var waitForAll = setInterval(function () {
          if (context.m_ArrowLoaded == true ) {
            clearInterval(waitForAll);
            isCreatedCallback();
          }
        }, 100);
    }

    runMapSelectScreen() {

        // remove any old map meshes
        this.removeMapSelectionMeshes();

        let distanceFromCamera = 10;
        let selectMapScreenSize = this.getBestSelectMapScreenWidth( distanceFromCamera );

        if( selectMapScreenSize < 17 ) {
            this.m_MapBatchSize = 1;
        }
        else if( selectMapScreenSize < 20 ) {
            this.m_MapBatchSize = 2;
        }
        else {
            this.m_MapBatchSize = 3;
        }

        let numMapsPerPage = this.m_MapBatchSize;
        if( this.m_MapManager.jsonMaps.length < this.m_MapBatchSize ) {
            numMapsPerPage = this.m_MapManager.jsonMaps.length;
        }

        let mapSpacing = selectMapScreenSize * 0.05; // 5% spacing

        let spaceForSpacing = ((numMapsPerPage+1) * mapSpacing);

        let thumbnailWidth = (selectMapScreenSize-spaceForSpacing) / numMapsPerPage;

        // camera coordinates, 0,0 is center, so need to offset
        let xOffset = -(selectMapScreenSize/2) + mapSpacing;   // .. as camera 0,0 is middle of screen
        xOffset += (thumbnailWidth/2);                         // .. as coordinates are in middle of tile
        let yOffset = 0;                                       // fine, keep it in the middle

        let currentMapOffset = Math.max(this.m_MapSelectIndex, 0);
 
        this.displayMapSet( numMapsPerPage, currentMapOffset, xOffset, thumbnailWidth, mapSpacing, distanceFromCamera );
    }

    removeMapScreen() {
        this.removeMapSelectionMeshes();
        this.m_ArrowsSpinning = false;

        // Until we sort the instruction panel / control panel too;
            var fadeStep = 0.1;
            var fadePauseMs = 100;
            var fade = 1.0;
            var self = this;
            (function fadeDivs() {
                self.m_InstructionMgr.setWindowOpacity(1.0 - fade);
    
                fade -= fadeStep;
                if (fade > 0) {
                    setTimeout(fadeDivs, fadePauseMs);
                }
            })();
    }

    removeMapSelectionMeshes( ) {
        for( var i = 0; i < this.m_MapSelectionObjects.length; i++ ) {
            this.m_Camera.remove( this.m_MapSelectionObjects[i] );
        }
        this.m_MapSelectionObjects = [];

        this.m_Camera.remove( this.m_Camera.getObjectByName("mapSelectSpotlight") );
    }

    removeRetryButtons() {
        for( var i = 0; i < this.m_RetryButtonObjects.length; i++ ) {
            this.m_Camera.remove( this.m_RetryButtonObjects[i] );
        }
        this.m_RetryButtonObjects = [];
    }

    displayMapSet( numToShow, firstId, xOffset, thumbnailWidth, mapSpacing, distanceFromCamera ) {
        let screenOrder = 0;
        let thumbnailHeight = thumbnailWidth;
        let mapY = 0;
        let batch = Math.trunc(firstId / numToShow);
        let mapIdx = numToShow*batch;
        
        let lastMapToShow = Math.min( this.m_MapManager.jsonMaps.length, (numToShow*batch)+numToShow );
        for( ; mapIdx < lastMapToShow; ++mapIdx ) {
            var mapDef = this.m_MapManager.jsonMaps[ mapIdx ];
            if( !mapDef.hasOwnProperty('thumbnailTexture') ) {
                console.log("WARNING: Map " + mapIdx + " lacks a thumbnail");
                continue;
            }

            this.addMapSelectThumbnail( mapDef, mapIdx, thumbnailWidth, thumbnailHeight, screenOrder, mapSpacing, xOffset, mapY, distanceFromCamera );
            screenOrder++;
        }

        let arrowYOffset = mapY + (thumbnailWidth/2) + this.m_ArrowHeightOffset; 

        if( lastMapToShow < this.m_MapManager.jsonMaps.length )
        {
            this.addMapSelectArrow( this.m_NextArrow, "mapSelectNextArrow", 3, -(arrowYOffset), -distanceFromCamera, 1.6 )
        }

        if( batch > 0 ) {
            this.addMapSelectArrow( this.m_PrevArrow, "mapSelectPrevArrow", -3, -(arrowYOffset), -distanceFromCamera, -1.6 )
        }

        // Set the arrows spinning only once per 'selectLevel' state
        if( !this.m_ArrowsSpinning ) {

            this.m_ArrowsSpinning = true;

            let instance = this;
            let animDelayMs = 10;
            let rotateStep = 0.01;
            (function animateArrowSpin() {
                // Spin while on select screen and has parent (i.e. camera)
                if (instance.m_State == AlgoMission.TAppState.SELECTMAP ) 
                {
                    instance.m_NextArrow.rotation.x = instance.m_NextArrow.rotation.x - rotateStep;
                    instance.m_PrevArrow.rotation.x = instance.m_PrevArrow.rotation.x - rotateStep;
    
                    setTimeout(animateArrowSpin, animDelayMs);
                }
            })();
        }

        let spotlight = new THREE.SpotLight( 0xffffff, 1, 20, Math.PI/2  );
        spotlight.position.set(0,0,distanceFromCamera+1);
        spotlight.target = this.m_NextArrow;
        spotlight.name = "mapSelectSpotlight";
        this.m_Camera.add(spotlight);
    }

    addMapSelectThumbnail( mapDef, mapIdx, thumbnailWidth, thumbnailHeight, screenOrder, mapSpacing, xOffset, mapY, distanceFromCamera ) {

        let mapSelectGroup = new THREE.Group();

        var thumbnailTexture = mapDef.thumbnailTexture;
    
        let planeGeo = new THREE.PlaneGeometry(thumbnailWidth, thumbnailHeight);
        let material = new THREE.MeshBasicMaterial( { side:THREE.DoubleSide, map:thumbnailTexture, transparent:false, opacity:0.5 } );
        let thumbMesh = new THREE.Mesh(planeGeo, material);

        let mapX = (screenOrder * thumbnailWidth) + (screenOrder * mapSpacing);
        mapX += xOffset;    // center
        
        thumbMesh.position.set( mapX, mapY, -distanceFromCamera );
        thumbMesh.name = mapIdx;
        
        mapSelectGroup.add(thumbMesh);

        // Add completion awards
        let completionRate = this.m_MapManager.getCompletionRate(mapIdx);

        let spacing = 0.5;
        let awardXOffset = thumbMesh.position.x - (thumbnailWidth/2);
        let awardYOffset = thumbMesh.position.y + (thumbnailHeight/2);

        if( completionRate > 0 ) {
            let colour = 0xd9a004; // bronze
            if( completionRate >= 1 ) {
                colour = 0xdec990; // gold
            }
            else if( completionRate >= 0.5 ) {
                colour = 0xe8e5dc; // silver
            }

            const geometry = new THREE.CircleGeometry( 0.25, 16 );
            const material = new THREE.MeshStandardMaterial( { color: colour } );
            const awardMesh = new THREE.Mesh( geometry, material );
            awardMesh.position.set( awardXOffset+ spacing, awardYOffset - spacing, -(distanceFromCamera) )
            mapSelectGroup.add( awardMesh );
        }

        // Add highest score
        let highestScore = this.m_MapManager.getHighScore(mapIdx);
        let highScoreMsg = "High score: " + highestScore.toString();
        let highScoreMesh = this.messageToMesh(highScoreMsg, 0.33, 0xFFFFFF, undefined);
        let bottomOffset = thumbMesh.position.y - (thumbnailHeight/2);
        highScoreMesh.position.set( awardXOffset + (highScoreMesh.userData.width/2), bottomOffset + (highScoreMesh.userData.height/2), -10 );
        highScoreMesh.name = "highScoreMsg";
        mapSelectGroup.add(highScoreMesh);

        // Add map Id text
        let mapIdTextHeight = 0.75;
        let mapIdText = "Map #" + mapIdx + ": " +  mapDef.name;
        let mapIdMsgMesh = this.messageToMesh(mapIdText, mapIdTextHeight, 0xFFFFFF, undefined);
        mapIdMsgMesh.position.set( thumbMesh.position.x, thumbMesh.position.y+(thumbnailHeight/2)+mapIdTextHeight, -(distanceFromCamera) );
        mapIdMsgMesh.name = mapIdx;
        mapSelectGroup.add( mapIdMsgMesh );

        // Add map descriptive text
        let mapDescrTextHeight = 0.4;
        let mapDescrText = mapDef.instructions;
        let mapDescrMesh = this.messageToMesh(mapDescrText, mapDescrTextHeight, 0xFFFFFF, undefined);
        mapDescrMesh.position.set( thumbMesh.position.x, thumbMesh.position.y-(thumbnailHeight/2)-mapDescrTextHeight, -(distanceFromCamera) );
        mapDescrMesh.name = mapIdx;
        mapSelectGroup.add( mapDescrMesh );

        this.m_MapSelectionObjects.push(mapSelectGroup);
        this.m_Camera.add(mapSelectGroup);
    }

    addMapSelectArrow( arrow, name, xPos, yPos, zPos, yRot ) {
        arrow.scale.set(0.5,0.5,0.5);
        arrow.rotation.set( 0, yRot, 0 );
        arrow.position.set( xPos, yPos, zPos );
        arrow.name = name;
        
        this.m_MapSelectionObjects.push(arrow);
        this.m_Camera.add(arrow);
    }

    setupCollisionDetection() {
        this.m_Raycaster = new THREE.Raycaster();

        document.addEventListener('mousedown', this.onDocumentMouseDown.bind(this), false);
        document.addEventListener('touchstart', this.onDocumentTouchStart.bind(this), false);
    }

    //
    // Game Loop
    //

    // gameLoop()
    // Standard game loop with a fixed update rate to keep
    // things consistent, and a variable render rate to allow
    // for differences in machine performance
    //
    gameLoop() {
        var elapsedTime = this.m_Clock.getDelta();

        this.m_Lag += elapsedTime;

        // perform as many updates as we should do
        // based on the time elapsed from last gameloop call
        while (this.m_Lag >= AlgoMission.UPDATE_TIME_STEP) {
            this.update();

            this.m_Lag -= AlgoMission.UPDATE_TIME_STEP;
        }

        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update() {
        // Note: The time elapsed is AlgoMission.UPDATE_TIME_STEP as we update in fixed steps
        this.actOnState(AlgoMission.UPDATE_TIME_STEP);
        this.updateState();
    }

    render() {
        this.m_Renderer.render(this.m_Scene, this.m_Camera);
    }

    handleResize() {
        var width = this.m_Container.offsetWidth;
        var height = this.m_Container.offsetHeight;

        this.m_Camera.aspect = width / height;
        this.m_Camera.updateProjectionMatrix();

        this.m_Renderer.setSize(width, height);
    }

    // Detect object clicks
    onDocumentTouchStart(event) {
        event.preventDefault();
        event.clientX = event.touches[0].clientX;
        event.clientY = event.touches[0].clientY;
        this.onDocumentMouseDown(event);
    }

    onDocumentMouseDown(event) {

        event.preventDefault();
        event.stopImmediatePropagation();

        this.handleClickByState( event );
    }

    handleClickByState( event ) {

        switch( this.m_State ) {
            case AlgoMission.TAppState.INITIAL:
                // NOOP
                break;
            case AlgoMission.TAppState.READY:
                var instructionsUpdated = 0;
                var instructionClicked =
                    this.detectInstructionPress(event.clientX, event.clientY, this.m_Raycaster);
    
                if (instructionClicked >= 0) {
                    this.m_AmbientButtonClickSound.play();
    
                    // We handle CLEAR and GO here, others are added to the instruction list
                    if (instructionClicked == InstructionManager.instructionConfig.CLEAR) {
                        if (!this.m_InstructionMgr.isRunning()) {
                            this.m_InstructionMgr.clearInstructions();
    
                            instructionsUpdated = 1;
                        }
                    }
                    else if (instructionClicked == InstructionManager.instructionConfig.GO) {
                        if (!this.m_InstructionMgr.isRunning() && this.m_InstructionMgr.numInstructions() > 0) {
                            this.m_InstructionMgr.startInstructions();
                            this.m_Bot.prepareForNewInstruction();
                        }
                    }
                    else if (instructionClicked == InstructionManager.instructionConfig.GRID) {
                        this.toggleGridHelper();
                    }
                    else {
                        this.m_InstructionMgr.addInstruction(instructionClicked);
                        instructionsUpdated = 1;
                    }
                }
                this.m_InstructionMgr.updateWindow();
                break;
            case AlgoMission.TAppState.RUNNING:
                // NOOP
                break;
            case AlgoMission.TAppState.WIN:
                // If we're on the winner screen, then a click just means
                // select next map - don't detect any other button presses
                this.m_SelectMap = true;
                break;
            case AlgoMission.TAppState.DEAD:
                let buttonSelected = this.detectRetrySelection( event.clientX, event.clientY, this.m_Raycaster );
                if( buttonSelected == "retryButton" ) {
                    this.m_Retry = true;
                }
                else if( buttonSelected == "chooseMapButton" ) {
                    this.m_SelectMap = true;
                }
                break;
            case AlgoMission.TAppState.RETRY:
                // NOOP
                break;
            case AlgoMission.TAppState.SELECTMAP:
                let mapSelected = this.detectMapSelection(event.clientX, event.clientY, this.m_Raycaster );
                if( mapSelected == "mapSelectPrevArrow" ) {
                    let batch = Math.trunc(this.m_MapSelectIndex / this.m_MapBatchSize);
                    batch--;
                    this.m_MapSelectIndex = Math.max(0, batch * this.m_MapBatchSize);
                    this.displayMapScreen();
                }
                else if( mapSelected == "mapSelectNextArrow" ) {
                  
                    let batch = Math.trunc(this.m_MapSelectIndex / this.m_MapBatchSize);
                    batch++;
                    if( batch * this.m_MapBatchSize >= this.m_MapManager.jsonMaps.length ) {
                        batch--;
                    }
                    this.m_MapSelectIndex = batch * this.m_MapBatchSize;
                    this.displayMapScreen();
                }
                if( mapSelected > -1 ) {
                    this.m_SelectedMap = mapSelected;
                }
                break;
        }
    }

	detectMapSelection(xPos, yPos, raycaster) {
        return this.detectButtonPress( xPos, yPos, raycaster, this.m_MapSelectionObjects );
    }

    detectRetrySelection( xPos, yPos, raycaster) {
        return this.detectButtonPress( xPos, yPos, raycaster, this.m_RetryButtonObjects );
    }

	detectInstructionPress(xPos, yPos, raycaster) {
        var activeButtons = this.m_ControlPanel.getActiveButtons();
        var buttonObjects = [];
		for (var key in activeButtons) {
			var mesh = activeButtons[key];

			buttonObjects.push(mesh);
		}
        return this.detectButtonPress( xPos, yPos, raycaster, buttonObjects );
    }

    detectButtonPress( xPos, yPos, raycaster, buttonsToCheck ) {
        let selection = -1;

        if (typeof (raycaster) == "undefined") {
			return selection;
		}

        var mouse = new THREE.Vector2(); // TODO: create once
    
        mouse.x = ( xPos / this.m_Renderer.domElement.clientWidth ) * 2 - 1;
        mouse.y = - ( yPos / this.m_Renderer.domElement.clientHeight ) * 2 + 1;
        
        raycaster.setFromCamera( mouse, this.m_Camera );

        var intersects = raycaster.intersectObjects( buttonsToCheck );

        if( intersects.length > 0 ) {
            selection = intersects[0].object.name;
        }

		return selection;
    }

    toggleGridHelper() {
        if (this.m_GridHelperObject == null || this.m_Scene.getObjectByName("GridHelper") == null) {
            if (this.m_GridHelperObject == null) {
                var numSquares = 9; 		// Must be an odd number to centre the bus

                var botSize = this.m_Bot.getStepSize();
                var size = (botSize * numSquares);
                var offset = (botSize / 2); 	// we want bus in center of square
                var height = 1; 			// +ve = above road

                const points = [];
                var gridMaterial = new THREE.LineBasicMaterial({ color: 'white' });

                var adjustedHorizWidth = size / 2;  			// adjusted for centre being 0,0
                for (var horizSquareNum = 0; horizSquareNum <= numSquares; ++horizSquareNum) {
                    var depthPos = (botSize * horizSquareNum) - offset;
                    points.push(new THREE.Vector3(-adjustedHorizWidth, height, depthPos));
                    points.push(new THREE.Vector3(adjustedHorizWidth, height, depthPos));
                }

                var adjustedHorizStart = 0 - (botSize / 2); 	// start lines just behind bus (0,0)
                for (var vertSquareNum = 0; vertSquareNum <= numSquares; ++vertSquareNum) {
                    var horizPos = ((botSize * vertSquareNum) - adjustedHorizWidth);

                    points.push(new THREE.Vector3(horizPos, height, adjustedHorizStart));
                    points.push(new THREE.Vector3(horizPos, height, size - offset));
                }

                var gridGeo = new THREE.BufferGeometry().setFromPoints( points );
                this.m_GridHelperObject = new THREE.LineSegments(gridGeo, gridMaterial);
            }
            this.m_GridHelperObject.name = "GridHelper";
            this.m_Scene.add(this.m_GridHelperObject);
        }
        else {
            this.m_Scene.remove(this.m_GridHelperObject);
        }
    }

    //
    // Debugging Functions
    //

    addAxisHelper() {
        this.m_Scene.add(new THREE.AxisHelper(50));
    }
}

export { AlgoMission };
