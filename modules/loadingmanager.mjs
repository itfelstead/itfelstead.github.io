/**
    LoadingManager

    Author: Ian Felstead
*/

"use strict";

// Global Namespace
var ALGO = ALGO || {};

import { messageToMesh, limitViaScale, determineScale, getScreenHeightAtCameraDistance, getScreenWidthAtCameraDistance } from './algoutils.js'; 	        // utility functions

class LoadingManager {

    constructor( gameMgr, jobs ) {
        this.m_GameMgr = gameMgr;

        this.m_JobMonitor = [];
        this.addJobMonitors( jobs );

        this.m_RemoveScreen = false;

        this.m_Finished = false;
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
        return false;
    }

    jobExists( job ) {
        return this.m_JobMonitor.hasOwnProperty(job);
    }

    displayLoadingScreen( camera ) {

        let distanceFromCamera = 10;
        const screenHeight = getScreenHeightAtCameraDistance( distanceFromCamera, camera.fov );
        const screenWidth = getScreenWidthAtCameraDistance( distanceFromCamera, screenHeight, camera.aspect );

        let loadingMsgMesh = messageToMesh(document, "LOADING", 2, 0xFFFFFF, undefined);
        
        loadingMsgMesh.name = "loadingMsgMesh";
        let scale = determineScale( screenWidth, 33, loadingMsgMesh.userData.width );
        loadingMsgMesh.scale.set( scale, scale, 1 );
        // or to left justify X : -((loadingMsgMesh.userData.width*scale)/2)
        loadingMsgMesh.position.set( 0, ((screenHeight)/2) - loadingMsgMesh.userData.height, -distanceFromCamera );  // top, middle
        this.m_GameMgr.getCamera().add(loadingMsgMesh);

        let vertSpacing = screenHeight * 0.05;     // 5%
        let yOffset = loadingMsgMesh.position.y - loadingMsgMesh.userData.height - vertSpacing;

        for (var job in this.m_JobMonitor) {

            let jobMesh = messageToMesh(document, job, 1, 0xFFFFFF, undefined);
            scale = determineScale( screenWidth, 10, jobMesh.userData.width );
            jobMesh.userData.targetScale = scale;
            jobMesh.scale.set( scale, scale, 1 );
            yOffset = yOffset - vertSpacing - (jobMesh.userData.height*scale)/2;
            jobMesh.position.set( 0, yOffset, -distanceFromCamera );  // middle
            jobMesh.name = job;
            this.m_GameMgr.getCamera().add(jobMesh);
        }

        this.animateJobs();
    }

    markJobFailed( job ) {

        if( !this.jobExists(job) ) {
            return;
        }

        let jobMesh = this.m_JobMonitor[job];

        jobMesh.material.map.needsUpdate = true;

        jobMesh.ctx.fillStyle = "#DD0000"; 
        jobMesh.ctx.fillRect( 0, 0, jobMesh.wPxAll, jobMesh.hPxAll );
        jobMeshctx.fillStyle = "#ffffff"; 
        jobMesh.ctx.fillText(job,jobMesh.wPxAll/2, jobMesh.hPxAll/2);
    }

    updateJobProgress( job, progress ) {

        if( !this.jobExists(job) ) {
            return;
        }
        
        let jobMesh = this.m_GameMgr.getCamera().getObjectByName("job");

        if( jobMesh ) {
            let targetScale = 1;
            if( jobMesh.hasOwnProperty("userData") &&
                jobMesh.userData.hasOwnProperty("targetScale") ) {
                targetScale = jobMesh.userData.targetScale;
            }
    
            // reduce the scale by progress amount (so job shrinks as it loads)
            let newScale = targetScale - progress;
            jobMesh.scale.set( newScale, newScale, 1 );
        }
    }

    update() {

        this.animateJobs();
        
        if( this.m_RemoveScreen ) {
            this.cleanupScreen();
        }
    }

    cleanupScreen() {

        let finalZ = 5;     // behind camera
        let zoomStep = 0.3;
        let loadingMsgMesh = this.m_GameMgr.getCamera().getObjectByName("loadingMsgMesh");
        if( loadingMsgMesh ) {
            this.animateZoomAway( loadingMsgMesh, zoomStep, finalZ );
        }
    
        if( loadingMsgMesh.position.z >= finalZ ) {

            this.m_GameMgr.getCamera().remove( loadingMsgMesh );

            // should all be zoomed away at this point, but just in case...
            for (var job in this.m_JobMonitor) {
                let mesh = this.m_GameMgr.getCamera().getObjectByName(job);
                if( mesh ) {
                    this.m_GameMgr.getCamera().remove( mesh );
                } 
            }

            this.m_Finished = true;     // indicate to game that we're done
        }
    }

    isFinished() {
        return this.m_Finished;
    }

    animateJobs() {

        let finalZ = 5;     // behind camera
        let zoomStep = 0.6;

        for (var job in this.m_JobMonitor) {
            let jobMesh = this.m_GameMgr.getCamera().getObjectByName(job);
            if( jobMesh ) {
                this.animateJob( job, jobMesh, zoomStep, finalZ )
            }
        }
    }

    animateJob( job, mesh, zoomStep, finalZ ) {

        // if job is complete, animate the zoom away, unless already zoomed, otherwise spin
        if( this.m_JobMonitor[job] == true ) {
            if( mesh.position.z < finalZ ) {
                mesh.position.z = mesh.position.z + zoomStep;
            }
        }
 
        mesh.rotation.y = mesh.rotation.y + (zoomStep/10);
    }

    animateZoomAway( mesh, zoomStep, finalZ ) {
        if( mesh.position.z < finalZ  ) {
            mesh.position.z = mesh.position.z + zoomStep;
            mesh.position.y = mesh.position.y - (zoomStep*2);
            mesh.rotation.z = mesh.rotation.z + (zoomStep/10);
        }
    }

    startLoadingScreenShutdown() {
        // will start removal on next call to update() (i.e. via gameloop)
        this.m_RemoveScreen = true;
    }
}

export { LoadingManager };