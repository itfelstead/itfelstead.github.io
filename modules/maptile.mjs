/**
  The Tile class.

  Author: Ian Felstead
*/

"use strict";

import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.135.0-pjGUcRG9Xt70OdXl97VF/mode=imports,min/optimized/three.js';

/**
 * @namespace The algo-mission namespace
 */
 var ALGO = ALGO || {};

 class MapTile {

    /**
     * constructor
     * @class The Tile class. Represents an individual tile on the map.
     *
    */
    constructor( tileName, geometry, material, gameMgr ) {
        this.m_Name = tileName;
        this.m_TileMesh = new THREE.Mesh( geometry, material );
        this.m_TileMesh.name = this.m_Name;
        this.m_GameMgr = gameMgr;

        this.m_Role = "";
        this.m_Type = "";   // "tile_vert" etc...
        this.m_Flair = [];
    }

    getTileMesh( geometry, material ) {
        return this.m_TileMesh;
    }

    setTilePosition( x, y, z ) {
        this.m_TileMesh.position.set( x, y, z );
    }

    setRelativePosition( layoutX, layoutZ ) {
        this.layoutX = layoutX;
        this.layoutZ = layoutZ;
    }

    getRelativePositionX() {
        return this.layoutX;
    }

    getRelativePositionZ() {
        return this.layoutZ;
    }

    setTileRole( role ) {
        if( role ) {
            this.m_Role = role;
        }
        else {
            this.m_Role = "";
        }
    }

    getTileRole( role ) {
        return this.m_Role;
    }

    setTileType( tileType ) {
        this.m_Type = tileType;
    }

    getTileType( ) {
        return this.m_Type;
    }

    // @param flair: TileFlare object
    addFlair( flair ) {
        this.m_Flair.push( flair );
    }

    triggerFlair( optionalName ) {
        if( optionalName ) {
            this.m_Flair.forEach( function(flair){ 
                if( flair.getName() == optionalName ) {
                    flair.trigger();
                }
            });
        }
        else
        {
            this.m_Flair.forEach( function(flair){ 
                flair.trigger();
            });
        }
    }

    update( timeElapsed ) {
        this.m_Flair.forEach( function(flair){ 
            flair.update( timeElapsed );
        });
    }

    getFlairMeshes() {
        let flairMeshes = [];
        this.m_Flair.forEach( function(flair){ 
            flairMeshes.push( flair.getMesh() );
        });

        return flairMeshes;
    }

    activate() {
        this.m_Flair.forEach( function(flair){ 
            flair.activate();
        });   
    }

    deactivate() {
        this.m_Flair.forEach( function(flair){ 
            flair.deactivate( );
        });   
    }

    doSpecial( instruction ) {
        this.m_Flair.forEach( function(flair){ 
            flair.doSpecial( instruction );
        });   
    }
 }

 export { MapTile };