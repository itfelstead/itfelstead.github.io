/**
	The MapManager Module.

	Requires THREE.JS to have been loaded.

	Author: Ian Felstead
*/

"use strict";

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

// Cloning of skinned meshes (bird in our case) is not yet supported in the three.js core, so use SkeletonUtils
import * as SkeletonUtils from 'https://threejs.org/examples/jsm/utils/SkeletonUtils.js';

import { MapTile } from "./maptile.mjs";
import { TileFlairBusStop } from "./tileflairbusstop.mjs";
import { TileFlairLady } from "./tileflairlady.mjs";
import { TileFlairBird } from "./tileflairbird.mjs";
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.135.0/examples/jsm/loaders/GLTFLoader.js';

/**
 * @namespace The algo-mission namespace
 */
var ALGO = ALGO || {};

// Instruction Manager can be a map tile observer 
import { InstructionManager } from './instructionmanager.mjs';
import { AlgoMission } from '../algomission.mjs'; 	// for observer notification types
import { calculateMeshHeight } from './algoutils.js'; 	        // utility functions


class MapManager 
{
	/**
	* Class Constants
	*
	*/
	static INITIAL_MAP_ID = 0;

	static NO_TILE = "NO_TILE"; 	// role value for empty tiles (air)

	/**
	* constructor
	* @class The MapManager class. Manages maps in the game.
	*/
	constructor( gameMgr ) 
	{
		this.gameMgr = gameMgr;

		this.tileLength = 0; 	// resized after bot is loaded
		this.tileHeight = 0.1; 	// resized after bot is loaded
	
		// tileConfig;
		// updated with loadedTexture & loadedTextureFlipped when loaded
		this.tileConfig = {};
	
		this.tileTextures = {}; 	// loaded later. key = id, value = {texture, flippedTexture}
	
		this.availableMaps = []; 	// loaded from an overview JSON file later
	
		this.activeTileObjects = []; 	// updated when a map is loaded
		this.activeTileMeshes = []; 	// the THREE.Mesh's used by the tiles
		this.idToMapObject = []; 		// key: map object name, value: MapTile object
	
		this.loadedTextures = {};   // texture path/name to loaded texture;
	
		this.mapLoaded = false;
		this.texturesLoaded = false;
		this.thumbnailsGenerated = false;

		// Positioning:
		// 	All tile positions are relative to the start tile (at 0,0)
		//      (on which the bus will be placed).
		//      Positions should be unique i.e. only one tile in a particular spot
		//	Positions values will be translated to world coordinates
		this.jsonMaps = [];
	
		// set to true when the JSON map/tile config has been loaded
		this.mapLoaded = false;

		// Flair Assets
		this.flairAssetsToLoad = 5;

		this.flairGltf = []; 	// "Bird", "Lady", "BusStop"
		this.flairAudio = []; 	// "BirdFlairSound_Angry", "LadyFlairSound_Angry"

		this.raycaster = new THREE.Raycaster();
	
		this.currentActiveTile = "";
	
		this.observers = [];

		this.m_Successes = 0;
	}

	registerObserver(observer)
	{
		this.observers.push(observer);
	}

	unregisterObserver(observer)
	{
		this.observers = this.observers.filter(
			function(existingObserver) {
				if(existingObserver !== observer) {
					return existingObserver;
				}
			}
		);
	}

	registerFlairSuccess( scoreDelta, contributesToWin )
	{
		this.notifyObservers( AlgoMission.TNotificationType.SCORE_CHANGE, scoreDelta );
		
		if( contributesToWin ) {

			++this.m_Successes;

			this.updateMapSuccessRate();
		}
	}

	isCurrentMapComplete() {
		return this.m_Successes >= this.mapSuccessCriteria;
	}

	updateMapSuccessRate() {
		let oldRate = 0;
		if( this.jsonMaps[ this.currentMap ].m_CompletionRate ) {
			oldRate = this.jsonMaps[ this.currentMap ].m_CompletionRate;
		}

		let newRate = (this.m_Successes / this.maximumScore);
		this.jsonMaps[ this.currentMap ].m_CompletionRate = Math.max( oldRate, newRate );
	}

	applyScore( score ) {
		let previousHigh = 0;

		if( this.currentMap >= 0 &&
			this.jsonMaps[ this.currentMap ].hasOwnProperty("m_HighScore") ) {
			previousHigh = this.jsonMaps[ this.currentMap ].m_HighScore;
		}

		this.jsonMaps[ this.currentMap ].m_HighScore = Math.max( previousHigh, score );
	}

	getHighScore( mapIdx ) {
		if( mapIdx >= 0 &&
			this.jsonMaps[ mapIdx ].hasOwnProperty("m_HighScore") ) {
			return this.jsonMaps[ mapIdx ].m_HighScore;
		}
		return 0;
	}

	getCompletionRate( mapIdx ) {
		if( this.jsonMaps[mapIdx].m_CompletionRate ) {
			return this.jsonMaps[mapIdx].m_CompletionRate;
		}
		return 0;
	}

	resetAttempt() {
		this.m_Successes = 0;
	}

	registerFlairFailure( scoreDelta ) {
		this.notifyObservers( AlgoMission.TNotificationType.SCORE_CHANGE, scoreDelta );
	}

	notifyObservers(notificationType, notificationValue)
	{
		this.observers.forEach(
			function(observer) {
				observer.updateTriggered( notificationType, notificationValue );
			}
		);
	}

	/**
	*  load
	*
	* @param {THREE.TextureLoader} textureLoader - for loading textures
	* @param {GLTFLoader} glTFLoader - for loading GLTF models
	* @param {function} callbackFn - called when map manger is ready (i.e. textures loaded)
	*/
	load(textureLoader, glTFLoader, callbackFn )
	{
		this.mapLoaded = false;
		// note: we don't reset flair loaded, as flair applied to all maps
		var instance = this; 	// so we can access map inside anon-function

		this.loadJSON("maps_set1.json",
				function(data) {
					instance.jsonMaps = data.mapDefinition;
					instance.tileConfig = data.tileConfig;
					instance.mapLoaded = true;
				},
				function(xhr) { console.error(xhr); }
		);

		// wait until maps are loaded, then load textures and flair...
		var waitForMapLoad = setInterval( function(){
			if( instance.mapLoaded == true )
			{
				instance.loadTextures( textureLoader, 
					function() {
						instance.texturesLoaded = true;
					} );

				instance.loadFlairModels( glTFLoader );

				clearInterval( waitForMapLoad );
			}
		}, 100 ); 

		// if the textures are loaded, then generate thumbnails
		var waitForTextureLoad = setInterval( 
			function(){
				if( instance.texturesLoaded == true ) {
					instance.generateThumbnails();
					clearInterval( waitForTextureLoad );
				}
			}
	   	);

		// wait until everything is loaded before calling caller's callback
        this.waitForMapFullyLoaded( callbackFn, this );
	}

	loadFlairModels( glTFLoader )
	{
		if( this.flairLoaded != 0 ) {
			this.loadModel( "./models/BusStop_Raid/scene.gltf", glTFLoader, this.busStopLoadedCb.bind(this) );
			this.loadModel( "./models/Mary_XaneMyers/scene.gltf", glTFLoader, this.ladyLoadedCb.bind(this) );
			this.loadModel( "./models/Pigeon_FourthGreen/scene.gltf", glTFLoader, this.birdLoadedCb.bind(this) );
			this.loadSound( "./audio/42793__digifishmusic__australian-magpie-gymnorhina-tibicen-squawk-1.wav", "BirdFlairSound_Angry", this.gameMgr.m_AudioListener );
			this.loadSound( "./audio/323707__reitanna__ooh.wav", "LadyFlairSound_Angry", this.gameMgr.m_AudioListener );
		}
	}

	loadSound( soundFile, name, listener ) {

		let audio = new THREE.Audio(listener);
		audio.name = name;
		this.flairAudio[name] = audio;

		this.gameMgr.m_Scene.add( audio );

		var loader = new THREE.AudioLoader();
		var self = this;
		loader.load( soundFile,
			function (audioBuffer) {
				//on load
				self.flairAudio[name].setBuffer(audioBuffer);
				self.flairAssetsToLoad--;
			}
		);
	}

    loadModel(model, glTFLoader, isCreatedCallback) {
        var instance = this;
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

	busStopLoadedCb( gltfObj ) {

		this.flairGltf["BusStop"] = gltfObj;

		// Center the scene
		const box = new THREE.Box3( ).setFromObject( this.flairGltf["BusStop"].scene );
		const c = box.getCenter( new THREE.Vector3( ) );
		const size = box.getSize( new THREE.Vector3( ) );
		this.flairGltf["BusStop"].scene.position.set( -c.x, size.y / 2 - c.y, -c.z );
		
        this.flairAssetsToLoad--;
    }

	ladyLoadedCb( gltfObj ) {

		// .scene has;
		//  - "Sketchfab_Scene" group (containing "Sketchfab_model" Object 3D)
		//  - "Sketchfab_model" Object3D (containing materialmerger gles)
		//  - materialmerger gles Object3D *containing the mesh)
		//  - Mesh "Object_2"
		this.flairGltf["Lady"] = gltfObj;

		// Center the scene
		const box = new THREE.Box3( ).setFromObject( this.flairGltf["Lady"].scene );
		const c = box.getCenter( new THREE.Vector3( ) );
		const size = box.getSize( new THREE.Vector3( ) );
		this.flairGltf["Lady"].scene.position.set( -c.x, size.y / 2 - c.y, -c.z );
		
        this.flairAssetsToLoad--;
    }

	birdLoadedCb( gltfObj ) {

		this.flairGltf["Bird"] = gltfObj;

		// Center the scene
		const box = new THREE.Box3( ).setFromObject( this.flairGltf["Bird"].scene );
		const c = box.getCenter( new THREE.Vector3( ) );
		const size = box.getSize( new THREE.Vector3( ) );
		this.flairGltf["Bird"].scene.position.set( -c.x, size.y / 2 - c.y, -c.z );

        this.flairAssetsToLoad--;
    }

	waitForMapFullyLoaded(isCreatedCallback, context) 
	{
        var waitForAll = setInterval(function () {

          if (context.mapLoaded == true &&
			  context.texturesLoaded == true &&
			  context.flairAssetsToLoad <= 0 &&
			  context.thumbnailsGenerated == true) {

				if( context.flairAssetsToLoad < 0 ) {
					console.log("WARNING: Unexpected number of flair loaded.");
				}

				clearInterval(waitForAll);
				isCreatedCallback(); 
          }
        }, 100);
    }

	calculateMapSize( tileLayout ) {
		let lowestX = 0;
		let highestX = 0;
		let lowestZ = 0;
		let highestZ = 0;

		for( var i =0; i < tileLayout.length; ++i ) {
			let row = tileLayout[i];
			lowestX = Math.min( row.x, lowestX );
			lowestZ = Math.min( row.z, lowestZ );
			highestX = Math.max( row.x, highestX );
			highestZ = Math.max( row.z, highestZ );
		}

		return [lowestX, lowestZ, highestX, highestZ];
	}

	generateThumbnails() {
		const thumbnailWidth = 200;
		const thumbnailHeight = 200;
		const maxTileWidth = 50; 	// prevent small maps looking too zoomed in
		const maxTileHeight = 50;

		// Flipper canvas is used to workaround an issue I had mirroring the map tiles
		let flipperCanvas = document.createElement("canvas");
		let flipperContext = flipperCanvas.getContext("2d");
		flipperContext.save();

		for( var mapIdx = 0; mapIdx < this.jsonMaps.length; ++mapIdx ) {

			// Create a canvas fo hold the final map thumbnail image
			let thumbCanvas = document.createElement("canvas");
			let thumbContext = thumbCanvas.getContext("2d");
			thumbCanvas.width = thumbnailWidth;
			thumbCanvas.height = thumbnailHeight;

			var mapDef = this.jsonMaps[ mapIdx ];
			var tileLayout = mapDef.tileLayout

			// Calculate the size of each tile, and required offsets (as all tiles are positioned in relation to tile 0,0)
			const [lowestX, lowestZ, highestX, highestZ] = this.calculateMapSize( tileLayout );

			let xSpan = Math.abs(highestX-lowestX) + 1;
			let zSpan = Math.abs(highestZ-lowestZ) + 1;

			let scaledTileWidth = Math.min(thumbnailWidth / xSpan, maxTileWidth);
			let scaledTileHeight = Math.min(thumbnailHeight / zSpan, maxTileHeight);

			// thumbnail will be left justified without these...
			let centerOffsetX = (thumbnailWidth - (xSpan * scaledTileWidth)) / 2; 
			let centerOffsetZ = (thumbnailWidth - (zSpan * scaledTileHeight)) / 2; 
			
			for( var rowIdx = 0; rowIdx < tileLayout.length; rowIdx++ ) {
				var mapTile = tileLayout[rowIdx];

				// Get pre-loaded texture
				var texture = null;
				var flippedTexture = null;

				if( mapTile.id )
				{
					var tileCfg = this.tileConfig[mapTile.id];
					if( tileCfg &&
						tileCfg.hasOwnProperty('loadedTexture') && tileCfg.hasOwnProperty('loadedTextureFlipped') )
					{
						texture = tileCfg.loadedTexture;
					}
				}

				var image = texture.image;

				flipperCanvas.height = image.height;
				flipperCanvas.width = image.width;
				flipperContext.scale(-1,-1);

				// Adjust between coordinate systems (JSON Map layoyt vs canvas)
				let adjustedX = xSpan - (mapTile.x - lowestX) - 1;
				var destX = ((adjustedX) * scaledTileWidth) + centerOffsetX; 

				let adjustedZ = zSpan - (mapTile.z - lowestZ) - 1;
				var destZ = ((adjustedZ) * scaledTileHeight) + centerOffsetZ;

				// Remaining issue is that the image needs to be flipped horizontally and vertically
				// Only way I could get it to work is to use an intermediate canvas..
				flipperContext.drawImage( image, image.width*-1, image.height*-1);

				thumbContext.drawImage( flipperCanvas, 0,0, image.width, image.height, destX ,destZ, scaledTileWidth, scaledTileHeight);
			}

			mapDef.thumbnailTexture = new THREE.CanvasTexture(thumbCanvas);
			mapDef.thumbnailTexture.minFilter = THREE.LinearFilter;
		}

		this.thumbnailsGenerated = true;
	}

	/**
	* getMapInfo()
	* tbd
	*
	*/
	getMapInfo( )
	{
		var mapInfo = [];
		for( var i = 0; i < this.jsonMaps.length; ++i )
		{
			var info = {};
			var mapDetails = this.jsonMaps[i];
			info.mapid = mapDetails.mapid;
			info.name = mapDetails.name;
			info.instructions = mapDetails.instructions;
			info.difficulty = mapDetails.difficulty;

			mapInfo.push( info );
		}

		return mapInfo;
	}


	/**
	* loadMap()
	* Loads the map definition related to the supplied map id.
	*
	* @param {int} mapId - (optional) mapId from the map summary file (see load()). Loads first map if unspecified.
	*
	*/
	loadMap( mapId, sceneToUpdate )
	{
		if( typeof mapId == 'undefined' )
		{
			mapId = 0;
		}

		var mapDef = this.jsonMaps[ mapId ]; 

		this.removeMapFromScene( sceneToUpdate );

		this.currentMap = mapId;
		this.activeTileObjects = [];
		this.activeTileMeshes = [];
		this.idToMapObject = {};
		this.currentActiveTile = "";
		this.m_Successes = 0;
		this.mapSuccessCriteria = mapDef.successCriteria;
		this.maximumScore = mapDef.maximumScore;

		this.createMapObjects( mapDef );

		this.addMapToScene( sceneToUpdate );
	}

	/**
	* resize()
	*
	* Resizes the map tiles.
	* Usually called to adjust the map tiles to fit the configured Bot's length.
	*
	* @param {int} tileLength - required length of each map tile
	* @param (int) tileHeight - required height of each map tile
	*/
	resize( tileLength, tileHeight )
	{
		if( tileLength != this.tileLength || tileHeight != this.tileHeight )
		{
			this.tileLength = tileLength;
			this.tileHeight = tileHeight;
		}
	}

	/**
	* createMapObjects()
	*
	* Create and position map tile objects ready for adding to a
	* scene via setMapVisibility().
	*
	* @param {hash} mapDef - map definition hash
	*
	*/
	createMapObjects( mapDef )
	{
		var layout = mapDef.tileLayout;

		var stdTileGeo = new THREE.BoxGeometry( this.tileLength, this.tileHeight, this.tileLength );

		for( var i = 0; i < layout.length; i++ )
		{
			var mapTile = layout[i];

			// Get pre-loaded texture
			var texture = null;
			var flippedTexture = null;
			var tileId = mapTile.id;

			if( mapTile.id )
			{
				var tileCfg = this.tileConfig[mapTile.id];
				if( tileCfg &&
					tileCfg.hasOwnProperty('loadedTexture') && tileCfg.hasOwnProperty('loadedTextureFlipped') )
				{
					texture = tileCfg.loadedTexture;
					flippedTexture = tileCfg.loadedTextureFlipped;
				}
			}

			var borderMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 });
			var topMaterial = new THREE.MeshBasicMaterial( {map: texture, transparent: true} );
			var bottomMaterial = new THREE.MeshBasicMaterial( {map: flippedTexture, transparent: true} );

			var materials = [
				borderMaterial, borderMaterial,	// left, right
				topMaterial, bottomMaterial, 	// top, bottom
				borderMaterial, borderMaterial 	// front, back
			];

			var tileObject = new MapTile( "Tile_" + i, stdTileGeo, materials, this.gameMgr );
			let tileMesh = tileObject.getTileMesh();
			tileObject.setTileType( tileId );
			tileObject.setRelativePosition( mapTile.x, mapTile.z );
			this.translateTilePosition( tileObject, mapTile.x, mapTile.z );

			if( mapTile.hasOwnProperty('role') )
			{
				tileObject.setTileRole( mapTile.role );
			
				if( mapTile.role == "BUSSTOP" ) {
					this.addBusStopFlair( tileObject, "OSG_Scene", "BusStop_" + i );
					this.addLadyFlair( tileObject, "Object_2", "Lady_" + i );
				}

				if( mapTile.role == "SPECIAL_BIRD" ) {
					this.addBirdFlair( tileObject, "OSG_Scene", "Bird_" + i );
				}
			}

			this.activeTileObjects.push( tileObject );
			this.activeTileMeshes.push( tileMesh ); 	// to ease intersection checks
			this.idToMapObject[ tileObject.m_Name ] = tileObject;
		}
	}

	addBusStopFlair( tileObject, meshName, flairName )
	{
		let flairMesh = this.flairGltf["BusStop"].scene.getObjectByName( meshName );
		let model = new THREE.Object3D();
		model.add( flairMesh.clone() );
		let flair = new TileFlairBusStop( flairName, model, this.flairAudio, this.gameMgr );
		this.positionBusStop( tileObject, model );
		model.scale.set(0.25,0.25,0.25);
		tileObject.addFlair( flair );
	}

	addLadyFlair( tileObject, meshName, flairName )
	{
		let flairMesh = this.flairGltf["Lady"].scene.getObjectByName( meshName );
		let model = new THREE.Object3D();
		model.add( flairMesh.clone() );
		let flair = new TileFlairLady( flairName, model, this.flairAudio, this.gameMgr );
		this.positionLady( tileObject, model );
		model.scale.set(0.15,0.15,0.15);
		model.rotation.set(-1.6,0,1.8);
		tileObject.addFlair( flair );
	}

	addBirdFlair( tileObject, meshName, flairName ) 
	{
		let flairMesh = this.flairGltf["Bird"].scene.getObjectByName( meshName );

        // WORKAROUND:
        // The bird mesh has transparency, which messes up depending on what
        // the camera is doing, so get rid of the transparency
        flairMesh.traverse(
            function(obj){
                if( obj.type === 'SkinnedMesh' ) {
                    obj.material.transparent = false;
                    obj.material.depthWrite = true;
                }
            }
        );

		let model = new THREE.Object3D();

		// Cloning of skinned meshes is not yet supported in the three.js core, so use SkeletonUtils
		model.add( SkeletonUtils.clone( flairMesh ) );
		
		let flair = new TileFlairBird( flairName, model, this.flairAudio, this.flairGltf["Bird"], this.gameMgr );
		let birdHeight = calculateMeshHeight( model );
		model.scale.set(0.5,0.5,0.5);
		this.positionBird( tileObject, model, birdHeight );
		
		tileObject.addFlair( flair );
	}

	positionBusStop( tileObject, mesh )
	{
		let tileMesh = tileObject.getTileMesh();
		let x = tileMesh.position.x;
		let y = tileMesh.position.y;
		let z = tileMesh.position.z;
		
		let rotX = 0;
		let rotY = 0;
		let rotZ = 0;

		switch( tileObject.getTileType() ) {
			case "tile_vert": 
			case "tile_top_deadend":
			case "tile_bottom_deadend":
				x = x - 20;
				rotY = 1.5;
			break;

			case "tile_horiz":
			case "tile_tjunct_horiz_down":
			case "tile_bend_left_down":
				x = x + 5; 
				z = z + 20;
				rotY = 3.1;
			break;

			case "tile_cross":
			case "tile_right_deadend":
			case "tile_left_deadend":
			case "tile_tjunct_horiz_up":
			case "tile_tjunct_vert_left":
			case "tile_tjunct_vert_right":
			case "tile_vert":
			case "tile_horiz":
			case "tile_bend_left_up":
			case "tile_bend_right_up":
			case "tile_bend_right_down":
				// TBD
			break;
		}

		mesh.rotation.set( rotX, rotY, rotZ );
		mesh.position.set( x , y, z );
	}

	positionLady( tileObject, mesh ) 
	{
		let tileMesh = tileObject.getTileMesh();
		let x = tileMesh.position.x;
		let y = tileMesh.position.y;
		let z = tileMesh.position.z
		
		//
		let rotX = 0;
		let rotY = 0;
		let rotZ = 3.1;

		switch( tileObject.getTileType() ) {
			case "tile_vert": 
			case "tile_top_deadend":
			case "tile_bottom_deadend":
				x = x - 20;
				z = z - 10;
				rotY = -1.5;
			break;

			case "tile_horiz": 
			case "tile_tjunct_horiz_down":
			case "tile_bend_left_down":
				x = x - 10;
				z = z + 20;
				rotY=0;
			break;

			case "tile_cross":
			case "tile_bottom_deadend":
			case "tile_right_deadend":
			case "tile_left_deadend":
			case "tile_tjunct_horiz_up":
			case "tile_tjunct_vert_left":
			case "tile_tjunct_vert_right":
			case "tile_vert":
			case "tile_horiz":
			case "tile_bend_left_up":
			case "tile_bend_right_up":
			case "tile_bend_right_down":
				// TBD
			break;
		}

		mesh.rotation.set( rotX, rotY, rotZ );
		mesh.position.set( x , y, z );
	}

	positionBird( tileObject, mesh, birdHeight )
	{
		let tileMesh = tileObject.getTileMesh();

		let x = tileMesh.position.x; 	// middle
		let y = tileMesh.position.y + birdHeight + (this.tileHeight/2);// ( this.tileHeight); 	// try to avoid render issues
		let zOffset = (this.tileLength/2) * 0.50; 	// 50% into second half of tile
		let z = tileMesh.position.z + zOffset;
		let rotX = 0;
		let rotY = 2;
		let rotZ = 0;

		mesh.rotation.set( rotX, rotY, rotZ );
		mesh.position.set( x , y, z );
	}

	/**
	* getTileMeshes
	*
	*
	*/
	getTileMeshes()
	{
		return this.activeTileMeshes;
	}

	/**
	* translateTilePosition()
	*
	* Positions a map tile by translating the relative positions
	* used in the map definition file to actual positions in the
	* scene.
	*
	* @param {hash} tileObject - map tile to position
	* @param {hash} relativeX - map definition x position
	* @param {hash} relativeZ - map definition z position
	*
	*/
	translateTilePosition( tileObject, relativeX, relativeZ )
	{
		var x = relativeX * this.tileLength;
		var y = 0; 	// TBD: Only supporting a single height at this point
		var z = relativeZ * this.tileLength;

		tileObject.setTilePosition( x, y, z );
	}

	/**
	* addMapToScene()
	*
	* Adds the map tiles in activeTileObjects to the scene
	*
	* @param {THREE.Scene} sceneToUpdate - scene to add map objects to
	*
	*/
	addMapToScene( sceneToUpdate )
	{
		this.applyToScene( sceneToUpdate, true );
	}

	/**
	* removeMapFromScene()
	*
	* Removes the map tiles listed in activeTileObjects from the scene
	*
	* @param {THREE.Scene} sceneToUpdate - scene to remove map objects from
	*
	*/
	removeMapFromScene( sceneToUpdate )
	{
		this.applyToScene( sceneToUpdate, false );
	}

	applyToScene( sceneToUpdate, addMeshes ) 
	{
		for( var i = 0; i < this.activeTileObjects.length; i++ )
		{
			var tileObject = this.activeTileObjects[i];

			if( addMeshes == true ) {
				sceneToUpdate.add( tileObject.getTileMesh() );
			}
			else {
				sceneToUpdate.remove( tileObject.getTileMesh() );
			}

			var flairMeshes = tileObject.getFlairMeshes();
			if( flairMeshes ) {
				flairMeshes.forEach( function(flair) {
					if( addMeshes == true ) {
						sceneToUpdate.add( flair );
					}
					else {
						sceneToUpdate.remove( flair );
					}
				} );
			}
		}
	}

	// if tileBeneath == "" then off map, else will hold textual id of tile.
	//
	getTileUnderPos( xPos, yPos, zPos )
	{
		var tileBeneath = "";
		var mapTiles = this.getTileMeshes();
		if( mapTiles.length > 0 )
		{
			var botPos = new THREE.Vector3;
			botPos.y = yPos;
			botPos.x = xPos;
			botPos.z = zPos; 
		
			var vec = new THREE.Vector3;
			vec.x = 0;
			vec.y = -1;
			vec.z = 0;
		
			this.raycaster.set( botPos, vec.normalize() );
		
			var intersects = this.raycaster.intersectObjects(mapTiles); // store intersecting objects
		
			if( intersects.length > 0 )
			{
				//console.log( "getTileUnderBot() num tiles under bot is ", intersects.length );
				tileBeneath = intersects[0].object.name;
			}
		}
	
		return tileBeneath;
	}

	activateTileUnderPos( xPos, yPos, zPos )
	{
		var tileId = this.getTileUnderPos( xPos, yPos, zPos );
		if( this.currentActiveTile != tileId ) {
			this.activateTile( tileId );
		}
	}

	handleNewInstruction() {
		var currentInstruction = this.gameMgr.getInstructionMgr().currentInstruction();

		if( currentInstruction == InstructionManager.instructionConfig.PAUSE ) {
			// Apply the action to any flair on the current tile
			if( this.currentActiveTile != "" ) {
				let oldTile = this.idToMapObject[ this.currentActiveTile ];
				oldTile.doSpecial( currentInstruction );
			}
		}
		else if( currentInstruction == InstructionManager.instructionConfig.FIRE ) {
			// Apply the action to any flair on tiles adjacent to the current tile
			if( this.currentActiveTile != "" ) {
				let adjacentTileIds = this.getAdjacentTileIds( this.currentActiveTile );
				if( adjacentTileIds ) {
					for( var i=0; i < adjacentTileIds.length; ++i ) {
						let adjTileId = adjacentTileIds[i];
						let adjTile = this.idToMapObject[ adjTileId ];
						adjTile.doSpecial( currentInstruction );
					}
				}
			}
		}
	}

	getAdjacentTileIds( middleTileId )
	{
		let adjTileIds = [];

		let middleTile = this.idToMapObject[ middleTileId ];
		let middleX = middleTile.getRelativePositionX();
		let middleZ = middleTile.getRelativePositionZ();

		for( var tileId in this.idToMapObject ) {

			// We include the middle tile in the 'adjacent' list
			let tileToTest = this.idToMapObject[ tileId ];

			if( (Math.abs(middleX - tileToTest.getRelativePositionX()) < 2) &&
			    (Math.abs(middleZ - tileToTest.getRelativePositionZ()) < 2) )
			{
				adjTileIds.push(tileId);
			}
		}

		return adjTileIds;
	}

	activateTile( tileId )
	{
		var role = this.getTileRole( tileId );

		if( this.currentActiveTile != "" ) {
			let oldTile = this.idToMapObject[ this.currentActiveTile ];
			oldTile.deactivate();
		}

		if( tileId != "" ) {
			let newTile = this.idToMapObject[ tileId ];
			newTile.activate();
		}

	
		this.notifyObservers( AlgoMission.TNotificationType.TILE_CHANGE, role );

		this.currentActiveTile = tileId;
	}

	getTileRole( tileId )
	{
		var role = '';
		var tileObject = this.idToMapObject[ tileId ];
		if( typeof(tileObject) == "undefined" )
		{
			role = "NO_TILE";
		}
		else
		{
			role = tileObject.getTileRole();
		}

		return role;
	}

	/**
	* update()
	*
	*
	*/
	update( timeElapsed )
	{
		for( var i = 0; i < this.activeTileObjects.length; i++ )
		{
			var tileObject = this.activeTileObjects[i];
			tileObject.update( timeElapsed );
		}
	}

	/**
	* loadJSON()
	*
	* @param {string} path - file name (and path) of JSON map file
	* @param {function} successFn 
	* @param {function} errorFn 
	*/
	loadJSON(path, successFn, errorFn)
	{
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function()
		{
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					if (successFn) {
						successFn(JSON.parse(xhr.responseText));
					}
				} else {
					if (errorFn) {
						errorFn(xhr);
					}
				}
			}
		};
		xhr.open("GET", path, true);
		xhr.send();
	}

	/**
	*  loadTextures
	*
	* @param {THREE.TextureLoader} textureLoader - for loading textures
	* @param {function} callbackFn - called when map manger is ready (i.e. textures loaded)
	*/
	loadTextures(textureLoader, callbackFn )
	{
		for( var tileId in this.tileConfig )
		{
			var tileEntry = this.tileConfig[tileId];
			if( tileEntry && tileEntry.hasOwnProperty("textureFile") )
			{
				// Load texture
				textureLoader.load( "textures/" + tileEntry.textureFile,

					// on load
					(function() {	var tileEntry_ = tileEntry; return function( texture )	{
						// console.log("loaded texture " + texture.id)
						tileEntry_.loadedTexture = texture;
					}	})(),

					// on download progress
					(function() {	var tileEntry_ = tileEntry; return function( xhr ) {
						//console.log( "textures/" + tileEntry_.textureFile + " " + (xhr.loaded / xhr.total * 100) + '% loaded' );
					}	})(),

					// on error
					(function() {	var tileEntry_ = tileEntry; return function( xhr ) {
						//console.log( 'Error loading textures/' + tileEntry_.textureFile );
					}	})()
				);

				// Load Flipped Texture
				// TBD clone() doesn't seem to be working.. so doing a duplicate load for now.
				// var flippedTexture = texture.clone();
				textureLoader.load( "textures/" + tileEntry.textureFile,
					// on load
					(function() {	var tileEntry_ = tileEntry; return function( texture )	{
						//console.log("loaded flipped texture " + texture.id)
						texture.flipY = false;
						tileEntry_.loadedTextureFlipped = texture;
					}	})(),

					// on download progress
					(function() {	var tileEntry_ = tileEntry; return function( xhr ) {
						//console.log( "textures/" + tileEntry_.textureFile + " " + (xhr.loaded / xhr.total * 100) + '% loaded' );
					}	})(),

					// on error
					(function() {	var tileEntry_ = tileEntry; return function( xhr ) {
						//console.log( 'Error loading textures/' + tileEntry_.textureFile );
					}	})()
				);
			}
		}

		function createMyInterval(f,dynamicParameter,interval) { 
			return setInterval( function() { 
					f(dynamicParameter);
				}, interval); 
		}

		var waitForTextures = createMyInterval(
			function(tileConfig) {
				var allDone = true;
				for( var tileId in tileConfig )
				{
					var tileEntry = tileConfig[tileId];
					if( tileEntry.hasOwnProperty("loadedTexture") == false ||
							tileEntry.hasOwnProperty("loadedTextureFlipped") == false )
					{
						// at least one not loaded, so continue to wait
						allDone = false;
						break;
					}
				}
				if( allDone == true )
				{
					// all tile textures loaded, inform caller via callback
					clearInterval(waitForTextures);
					if( callbackFn && typeof(callbackFn) === "function")
					{
						callbackFn();
					}
				}
			}, this.tileConfig, 500 );
	}
}

export { MapManager };