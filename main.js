import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let container;
let camera, scene, renderer;
let controller;

let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

let portalGroup;
let isPortalPlaced = false;

const instructionText = document.getElementById('instruction-text');
const startBtn = document.getElementById('start-btn');

init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // Activar AR con Hit-Test
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // Configurar Retículo (Marca donde colocar el portal)
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff6b81 })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Portal (Inicialmente no creado)
    createPortal();

    // Eventos de Toque
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
    
    // UI Events
    startBtn.addEventListener('click', () => {
        if (!isPortalPlaced && reticle.visible) {
            placePortal();
        }
    });

    // Detectar cuando entramos a AR
    renderer.xr.addEventListener('sessionstart', () => {
        instructionText.innerText = "Apunta al suelo y mueve el teléfono en círculos para detectar el espacio.";
    });
}

function createPortal() {
    portalGroup = new THREE.Group();
    portalGroup.visible = false;
    scene.add(portalGroup);

    // 1. MUNDO INTERIOR (Lo que se ve a través del portal)
    const innerWorld = new THREE.Group();
    // Para que se dibuje DESPUÉS del oclusor
    innerWorld.renderOrder = 2; 
    
    // Cielo estrellado / Esfera mágica
    const skyGeo = new THREE.SphereGeometry(4, 32, 32); // Radio 4
    const skyMat = new THREE.MeshBasicMaterial({
        color: 0x1a0b2e,
        side: THREE.BackSide,
        depthWrite: false // Evitar problemas con el oclusor si chocan
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    innerWorld.add(skyMesh);

    // Añadir estrellas al cielo
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 500;
    const posArray = new Float32Array(starsCount * 3);
    for(let i = 0; i < starsCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 7;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starsMat = new THREE.PointsMaterial({ size: 0.05, color: 0xffd700 });
    const starsMesh = new THREE.Points(starsGeo, starsMat);
    innerWorld.add(starsMesh);

    // Un corazón central flotante
    const x = 0, y = 0;
    const heartShape = new THREE.Shape();
    heartShape.moveTo( x + 0.5, y + 0.5 );
    heartShape.bezierCurveTo( x + 0.5, y + 0.5, x + 0.4, y, x, y );
    heartShape.bezierCurveTo( x - 0.6, y, x - 0.6, y + 0.7,x - 0.6, y + 0.7 );
    heartShape.bezierCurveTo( x - 0.6, y + 1.1, x - 0.3, y + 1.54, x + 0.5, y + 1.9 );
    heartShape.bezierCurveTo( x + 1.2, y + 1.54, x + 1.6, y + 1.1, x + 1.6, y + 0.7 );
    heartShape.bezierCurveTo( x + 1.6, y + 0.7, x + 1.6, y, x + 1.0, y );
    heartShape.bezierCurveTo( x + 0.7, y, x + 0.5, y + 0.5, x + 0.5, y + 0.5 );

    const extrudeSettings = { depth: 0.2, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.05, bevelThickness: 0.05 };
    const heartGeo = new THREE.ExtrudeGeometry( heartShape, extrudeSettings );
    heartGeo.center();
    const heartMat = new THREE.MeshStandardMaterial({ color: 0xff1493, roughness: 0.2, metalness: 0.8 });
    const heartMesh = new THREE.Mesh( heartGeo, heartMat );
    heartMesh.position.set(0, 1.5, -2); // Centro de la sala, al fondo
    heartMesh.scale.set(0.5, 0.5, 0.5);
    heartMesh.rotation.z = Math.PI; // Rotar para que esté derecho
    innerWorld.add(heartMesh);
    
    // Luz puntual para el corazón
    const pointLight = new THREE.PointLight(0xff6b81, 2, 5);
    pointLight.position.set(0, 1.5, -1.5);
    innerWorld.add(pointLight);

    // Guardar para animar
    innerWorld.userData.heart = heartMesh;

    // Texto flotante
    const loader = new FontLoader();
    loader.load( 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json', function ( font ) {
        const textGeo = new TextGeometry( 'Te amo\nGeraldine', {
            font: font,
            size: 0.2,
            height: 0.05,
        });
        textGeo.center();
        const textMat = new THREE.MeshBasicMaterial( { color: 0xffffff } );
        const textMesh = new THREE.Mesh( textGeo, textMat );
        textMesh.position.set(0, 2.5, -2);
        innerWorld.add(textMesh);
    });

    // 2. OCLUSOR (La caja invisible que esconde el interior)
    // El material con colorWrite: false escribirá en el Z-Buffer (profundidad) 
    // pero no en la pantalla. Así esconde lo que esté detrás.
    const ocluderMaterial = new THREE.MeshBasicMaterial({ 
        colorWrite: false, 
        side: THREE.DoubleSide // Oculta tanto por fuera como por dentro (las paredes)
    });
    const ocluderGroup = new THREE.Group();
    ocluderGroup.renderOrder = 1; // Dibujar ANTES del mundo interior

    const roomSize = 10;
    const doorWidth = 1.2;
    const doorHeight = 2.0;

    // Pared trasera
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), ocluderMaterial);
    backWall.position.set(0, roomSize/2, -roomSize/2);
    ocluderGroup.add(backWall);

    // Pared Izquierda
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), ocluderMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-roomSize/2, roomSize/2, 0);
    ocluderGroup.add(leftWall);

    // Pared Derecha
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), ocluderMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(roomSize/2, roomSize/2, 0);
    ocluderGroup.add(rightWall);

    // Techo
    const topWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), ocluderMaterial);
    topWall.rotation.x = Math.PI / 2;
    topWall.position.set(0, roomSize, 0);
    ocluderGroup.add(topWall);

    // Suelo
    const bottomWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), ocluderMaterial);
    bottomWall.rotation.x = -Math.PI / 2;
    bottomWall.position.set(0, 0, 0);
    ocluderGroup.add(bottomWall);

    // PARED FRONTAL (La que tiene la puerta)
    const frontWallLeftW = (roomSize - doorWidth) / 2;
    const frontWallLeft = new THREE.Mesh(new THREE.PlaneGeometry(frontWallLeftW, roomSize), ocluderMaterial);
    frontWallLeft.position.set(-doorWidth/2 - frontWallLeftW/2, roomSize/2, roomSize/2);
    ocluderGroup.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.PlaneGeometry(frontWallLeftW, roomSize), ocluderMaterial);
    frontWallRight.position.set(doorWidth/2 + frontWallLeftW/2, roomSize/2, roomSize/2);
    ocluderGroup.add(frontWallRight);

    const frontWallTopH = roomSize - doorHeight;
    const frontWallTop = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, frontWallTopH), ocluderMaterial);
    frontWallTop.position.set(0, doorHeight + frontWallTopH/2, roomSize/2);
    ocluderGroup.add(frontWallTop);

    // 3. MARCO DE LA PUERTA (Visible en el mundo real)
    const doorFrameGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xff6b81, metalness: 0.5, roughness: 0.1 });
    
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorHeight, 0.1), frameMat);
    frameLeft.position.set(-doorWidth/2, doorHeight/2, roomSize/2);
    
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorHeight, 0.1), frameMat);
    frameRight.position.set(doorWidth/2, doorHeight/2, roomSize/2);
    
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.2, 0.1, 0.1), frameMat);
    frameTop.position.set(0, doorHeight, roomSize/2);

    doorFrameGroup.add(frameLeft);
    doorFrameGroup.add(frameRight);
    doorFrameGroup.add(frameTop);

    // Ensamblar todo
    // Mover el oclusor para que la pared frontal (con la puerta) esté en Z=0
    ocluderGroup.position.z = -roomSize/2;
    doorFrameGroup.position.z = -roomSize/2;
    
    portalGroup.add(ocluderGroup);
    portalGroup.add(innerWorld);
    portalGroup.add(doorFrameGroup);

    // Configurar todos los materiales del mundo interior para ignorar profundidad 
    // SOLAMENTE si queremos que se rendericen obligatoriamente. Pero el motor lo maneja bien.
    // Para asegurar que los objetos interiores no se vean cortados si el oclusor de atrás los tapa:
    innerWorld.traverse((child) => {
        if (child.isMesh || child.isPoints) {
            // child.material.depthTest = true; 
        }
    });
}

function onSelect() {
    if (!isPortalPlaced && reticle.visible) {
        placePortal();
    }
}

function placePortal() {
    portalGroup.position.setFromMatrixPosition(reticle.matrix);
    
    // Orientar el portal hacia el usuario (cámara) pero solo en el eje Y
    const currentCameraPosition = new THREE.Vector3();
    camera.getWorldPosition(currentCameraPosition);
    currentCameraPosition.y = portalGroup.position.y; // Mantener plano horizontal
    portalGroup.lookAt(currentCameraPosition);
    
    portalGroup.visible = true;
    isPortalPlaced = true;
    
    reticle.visible = false;
    instructionText.innerText = "¡El Portal está abierto! Camina físicamente a través de la puerta.";
    startBtn.style.display = 'none';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource && !isPortalPlaced) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
                instructionText.innerText = "Superficie detectada. Toca la pantalla para colocar el Portal Mágico.";
                startBtn.style.display = 'block';
            } else {
                reticle.visible = false;
                startBtn.style.display = 'none';
            }
        }
    }

    // Animaciones del portal
    if (portalGroup && portalGroup.visible) {
        // Encontrar el mundo interior y animar el corazón
        const innerWorld = portalGroup.children[1];
        if (innerWorld && innerWorld.userData.heart) {
            const heart = innerWorld.userData.heart;
            heart.rotation.y += 0.01;
            heart.position.y = 1.5 + Math.sin(timestamp * 0.002) * 0.1; // Flotar
            
            // Latido sutil
            const scale = 0.5 + Math.sin(timestamp * 0.005) * 0.05;
            heart.scale.set(scale, scale, scale);
        }
    }

    renderer.render(scene, camera);
}
