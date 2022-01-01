/**
    LoadingManager

    Author: Ian Felstead
*/

"use strict";

// Global Namespace
var ALGO = ALGO || {};

import { AlgoMission } from '../algomission.mjs'; 	// for stuff that should really be in a utils class

class LoadingManager {

    constructor( gameMgr, jobs ) {
        this.m_GameMgr = gameMgr;

        this.m_JobMonitor = [];
        this.addJobMonitors( jobs );
    }

    addJobMonitors( jobs ) {
        for (let i = 0; i < jobs.length; ++i ) {
            this.addJobMonitor( jobs[i] );
        }
    }

    addJobMonitor( resource ) {
        if( this.m_JobMonitor.hasOwnProperty(resource) ) {
            console.log("Warning: Job already present; " + resource );
        }
        this.m_JobMonitor[resource] = false;
    }

    markJobComplete( resource ) {
        if( this.m_JobMonitor.hasOwnProperty(resource) ) {
            this.m_JobMonitor[resource] = true;
        }
        else {
            console.log("Warning: Job not present; " + resource );
        }
    }

    loadComplete( jobs ) {
        for (let i = 0; i < jobs.length; ++i ) {
            if( this.isLoaded( jobs[i] ) == false ) {
                return false;
            }
        }
        return true;
    }

    isLoaded( job ) {
        if( this.m_JobMonitor.hasOwnProperty(job) ) {
            return this.m_JobMonitor[job];
        }
        console.log("Warning: Job not found; " + job );
        return false;
    }

    displayLoadingScreen() {

        let distanceFromCamera = 10;
        const screenHeight = this.m_GameMgr.getScreenHeightAtCameraDistance( distanceFromCamera );
        const screenWidth = this.m_GameMgr.getScreenWidthAtCameraDistance( distanceFromCamera, screenHeight );

        let loadingMsgMesh = this.m_GameMgr.messageToMesh("LOADING", 2, 0xFFFFFF, undefined);
        
        loadingMsgMesh.position.set( -(loadingMsgMesh.userData.width/2), (screenHeight/2) - loadingMsgMesh.userData.height/2, -distanceFromCamera );  // top, middle
        loadingMsgMesh.name = "loadingMsgMesh";
        this.m_GameMgr.getCamera().add(loadingMsgMesh);

        let vertSpacing = screenHeight * 0.05;     // 5%
        let yOffset = loadingMsgMesh.position.y - loadingMsgMesh.userData.height/2 - vertSpacing;

        for (var job in this.m_JobMonitor) {

            let jobMesh = this.m_GameMgr.messageToMesh(job, 1, 0xFFFFFF, undefined);
            yOffset = yOffset - vertSpacing - jobMesh.userData.height/2;
            jobMesh.position.set( 0, yOffset, -distanceFromCamera );  // middle
            jobMesh.name = job;
            this.m_GameMgr.getCamera().add(jobMesh);
        }

        this.animateJobs();
    }

    animateJobs() {

        let animDelayMs = 10;
        let finalZ = 5;     // behind camera
        let rotateStep = 0.01;
        let zoomStep = 0.2;

        for (var job in this.m_JobMonitor) {
            let jobMesh = this.m_GameMgr.getCamera().getObjectByName(job);
            if( jobMesh ) {
                this.animateJob( job, jobMesh, animDelayMs, rotateStep, zoomStep, finalZ )
            }
        }
    }

    animateJob( job, mesh, animDelayMs, rotateStep, zoomStep, finalZ ) {

        let continueAnimation = true;

        // if job is complete, animate the zoom away, unless already zoomed
        if( this.m_JobMonitor[job] == true ) {
            if( mesh.position.z > finalZ ) {
                continueAnimation = false;      // mesh no longer visible
            }
            else {
                mesh.position.z = mesh.position.z + zoomStep;
            }
        }
        else {
            // spin if you want..
            mesh.rotation.y = mesh.rotation.y + (zoomStep/10);
        }
            
        if( continueAnimation) {
            setTimeout(this.animateJob.bind(this, job, mesh, animDelayMs, rotateStep, zoomStep, finalZ ), animDelayMs);
        }
    }

    animateZoomAway( mesh, animDelayMs, zoomStep, finalZ ) {
        if( mesh.position.z < finalZ  ) {
            mesh.position.z = mesh.position.z + zoomStep;
            mesh.position.y = mesh.position.y - (zoomStep*2);
            mesh.rotation.z = mesh.rotation.z + (zoomStep/10);
            setTimeout(this.animateZoomAway.bind(this, mesh, animDelayMs, zoomStep, finalZ ), animDelayMs);
        }
        else {
            this.m_GameMgr.getCamera().remove( mesh );
        }
    }

    removeLoadingScreen() {

        let animDelayMs = 10;
        let finalZ = 5;     // behind camera
        let zoomStep = 0.1;
        let loadingMsgMesh = this.m_GameMgr.getCamera().getObjectByName("loadingMsgMesh");
        if( loadingMsgMesh ) {
            this.animateZoomAway( loadingMsgMesh, animDelayMs, zoomStep, finalZ );
        }

        // should all be zoomed away at this point, but just in case...
        for (var job in this.m_JobMonitor) {
            let mesh = this.m_GameMgr.getCamera().getObjectByName(job);
            if( mesh ) {
                this.m_GameMgr.getCamera().remove( mesh );
            } 
        }
    }
}

export { LoadingManager };