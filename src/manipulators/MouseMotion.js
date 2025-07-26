/**
 * ./src/manipulators/MouseMotion.js
 *
 * Manipulator that uses mouse movement to control controller pose/orientation.
 * Captures mouse input and applies rotation to IMU data based on mouse movement.
 * 
 * Mouse Y movement -> pitch rotation (around Y axis)
 * Mouse X movement -> yaw rotation (around world vertical)
 */
import { BaseManipulator } from './BaseManipulator.js';

/**
 * @typedef {Object} MouseMotionParams
 * @property {number} [sensitivity=1.0] - Mouse sensitivity multiplier (0.1-5.0)
 * @property {boolean} [invertX=false] - Invert X-axis movement
 * @property {boolean} [invertY=false] - Invert Y-axis movement
 * @property {number} [smoothing=0.1] - Movement smoothing factor (0-1, 0=no smoothing)
 * @property {boolean} [resetOnCapture=true] - Reset pose when starting capture
 * @property {number} [pivotDistance=25.0] - Distance to pivot point in cm (default 25cm)
 * @property {number} [decayRate=0.1] - Rate to decay pitch to horizontal
 */

export class MouseMotion extends BaseManipulator {
	static get defaultConfig() {
		return {
			sensitivity: 1.0,
			invertX: false,
			invertY: false,
			smoothing: 0.0,
			resetOnCapture: true,
			pivotDistance: 25.0,
			decayRate: 0.1,
		};
	}

	static get displayName() {
		return "Mouse Motion";
	}

	static get requiredSwiCC() {
		return {
			type: "2wiCC", // SwiCC or 2wiCC
			firmware: "1.2",
		};
	}

	/**
	 * @param {MouseMotionParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.circleUnits = 2000; // Empirically, about 2000 mouse units per full circle feels right.
		this.sensitivity = params.sensitivity ?? MouseMotion.defaultConfig.sensitivity;
		this.invertX = params.invertX ?? MouseMotion.defaultConfig.invertX;
		this.invertY = params.invertY ?? MouseMotion.defaultConfig.invertY;
		this.smoothing = params.smoothing ?? MouseMotion.defaultConfig.smoothing;
		this.resetOnCapture = params.resetOnCapture ?? MouseMotion.defaultConfig.resetOnCapture;
		this.pivotDistance = params.pivotDistance ?? MouseMotion.defaultConfig.pivotDistance;
		this.decayRate = params.decayRate ?? MouseMotion.defaultConfig.decayRate;

		// Current pose angles (in radians)
		// pitch = rotation around Y axis (gamepad tilting forward/back)
		// yaw = rotation around world vertical (gamepad turning left/right)
		this.pitch = 0;
		this.yaw = 0;

		// Previous angular velocities for acceleration calculations
		this.prevAngularVelocities = { gyroX: 0, gyroY: 0, gyroZ: 0 };

		// Target pose for smoothing
		this.targetPitch = 0;
		this.targetYaw = 0;

		// Mouse velocity for gyro calculation (accumulated movement)
		this.accumulatedMouseX = 0;
		this.accumulatedMouseY = 0;

		// Mouse capture state
		this.isCapturing = false;
		this.pointerLocked = false;

		// UI elements
		this._captureButton = null;
		this._sensitivityInput = null;
		this._smoothingInput = null;
		this._invertXCheckbox = null;
		this._invertYCheckbox = null;
		this._resetOnCaptureCheckbox = null;
		this._pivotDistanceInput = null;
		this._decayRateInput = null;
		this._statusDisplay = null;
		this._poseDisplay = null;

		// Event handlers (bound for proper removal)
		this._mouseMoveHandler = this._onMouseMove.bind(this);
		this._pointerLockChangeHandler = this._onPointerLockChange.bind(this);
		this._pointerLockErrorHandler = this._onPointerLockError.bind(this);

		// Register mouse pose specific actions
		this._registerMouseMotionActions();
	}

	/**
	 * Register actions specific to the mouse pose manipulator
	 */
	_registerMouseMotionActions() {
		this.registerAction({
			name: 'startCapture',
			displayName: 'Start Mouse Capture',
			description: 'Start capturing mouse movement for pose control',
			handler: () => this.startCapture()
		});

		this.registerAction({
			name: 'stopCapture',
			displayName: 'Stop Mouse Capture',
			description: 'Stop capturing mouse movement',
			handler: () => this.stopCapture()
		});

		this.registerAction({
			name: 'toggleCapture',
			displayName: 'Toggle Mouse Capture',
			description: 'Toggle mouse capture on/off',
			handler: () => this.toggleCapture()
		});

		this.registerAction({
			name: 'resetPose',
			displayName: 'Reset Pose',
			description: 'Reset controller pose to neutral position',
			handler: () => this.resetPose()
		});

		this.registerAction({
			name: 'setSensitivity',
			displayName: 'Set Sensitivity',
			description: 'Set mouse sensitivity',
			parameters: [
				{
					name: 'sensitivity',
					type: 'number',
					description: 'Sensitivity multiplier (0.1-5.0)',
					required: true,
					default: 1.0
				}
			],
			handler: (params) => this.setSensitivity(params.sensitivity)
		});

		this.registerAction({
			name: 'setSmoothing',
			displayName: 'Set Smoothing',
			description: 'Set movement smoothing factor',
			parameters: [
				{
					name: 'smoothing',
					type: 'number',
					description: 'Smoothing factor (0-1)',
					required: true,
					default: 0.1
				}
			],
			handler: (params) => this.setSmoothing(params.smoothing)
		});

		this.registerAction({
			name: 'setInvertX',
			displayName: 'Set Invert X',
			description: 'Set X-axis inversion',
			parameters: [
				{
					name: 'invert',
					type: 'boolean',
					description: 'Whether to invert X-axis',
					required: true,
					default: false
				}
			],
			handler: (params) => this.setInvertX(params.invert)
		});

		this.registerAction({
			name: 'setInvertY',
			displayName: 'Set Invert Y',
			description: 'Set Y-axis inversion',
			parameters: [
				{
					name: 'invert',
					type: 'boolean',
					description: 'Whether to invert Y-axis',
					required: true,
					default: false
				}
			],
			handler: (params) => this.setInvertY(params.invert)
		});

		this.registerAction({
			name: 'setPivotDistance',
			displayName: 'Set Pivot Distance',
			description: 'Set distance to pivot point in meters',
			parameters: [
				{
					name: 'distance',
					type: 'number',
					description: 'Distance in meters (1.0-10.0)',
					required: true,
					default: 5.0
				}
			],
			handler: (params) => this.setPivotDistance(params.distance)
		});

		this.registerAction({
			name: 'setDecayRate',
			displayName: 'Set Decay Rate',
			description: 'Set rate to decay pitch to horizontal',
			parameters: [
				{
					name: 'rate',
					type: 'number',
					description: 'Rate (0.0-1.0)',
					required: true,
					default: 0.1
				}
			],
			handler: (params) => this.setDecayRate(params.rate)
		});

		this.registerAction({
			name: 'getPose',
			displayName: 'Get Current Pose',
			description: 'Get the current pose as pitch/yaw angles in radians',
			handler: () => this.getPose()
		});

		this.registerAction({
			name: 'setPose',
			displayName: 'Set Pose',
			description: 'Set the controller pose using pitch and yaw angles',
			parameters: [
				{ name: 'pitch', type: 'number', description: 'Pitch angle in radians (around Y axis)', default: 0 },
				{ name: 'yaw', type: 'number', description: 'Yaw angle in radians (around world vertical)', default: 0 }
			],
			handler: (params) => this.setPose(params.pitch || 0, params.yaw || 0)
		});
	}

	/**
	 * Start capturing mouse movement
	 */
	startCapture() {
		if (this.isCapturing) {
			return false;
		}

		// Reset pose if configured to do so
		if (this.resetOnCapture) {
			this.resetPose();
		}

		// Request pointer lock on the document body
		if (document.body.requestPointerLock) {
			document.body.requestPointerLock();
		} else {
			this.log('Pointer lock not supported');
			return false;
		}

		this.isCapturing = true;
		this._updateUI();
		this.log('Mouse capture started');
		return true;
	}

	/**
	 * Stop capturing mouse movement
	 */
	stopCapture() {
		if (!this.isCapturing) {
			return false;
		}

		if (document.exitPointerLock) {
			document.exitPointerLock();
		}

		this.isCapturing = false;
		this._updateUI();
		this.log('Mouse capture stopped');
		return true;
	}

	/**
	 * Toggle mouse capture
	 */
	toggleCapture() {
		if (this.isCapturing) {
			return this.stopCapture();
		} else {
			return this.startCapture();
		}
	}

	/**
	 * Reset pose to neutral position
	 */
	resetPose() {
		this.pitch = 0;
		this.yaw = 0;
		this.prevAngularVelocities = { gyroX: 0, gyroY: 0, gyroZ: 0 };
		this.targetPitch = 0;
		this.targetYaw = 0;
		this.accumulatedMouseX = 0;
		this.accumulatedMouseY = 0;
		this._updatePoseDisplay();
		this.log('Pose reset to neutral');
		return true;
	}

	/**
	 * Set mouse sensitivity
	 * @param {number} sensitivity
	 */
	setSensitivity(sensitivity) {
		const newSensitivity = Math.max(0.1, Math.min(5.0, sensitivity));
		this.sensitivity = newSensitivity;

		if (this._sensitivityInput) {
			this._sensitivityInput.value = newSensitivity;
		}

		this.log(`Sensitivity set to ${newSensitivity}`);
		return newSensitivity;
	}

	/**
	 * Set movement smoothing
	 * @param {number} smoothing
	 */
	setSmoothing(smoothing) {
		const newSmoothing = Math.max(0, Math.min(0.1, smoothing));
		this.smoothing = newSmoothing;

		if (this._smoothingInput) {
			this._smoothingInput.value = newSmoothing;
		}

		this.log(`Smoothing set to ${newSmoothing}`);
		return newSmoothing;
	}

	/**
	 * Set X-axis inversion
	 * @param {boolean} invert
	 */
	setInvertX(invert) {
		this.invertX = Boolean(invert);

		if (this._invertXCheckbox) {
			this._invertXCheckbox.checked = this.invertX;
		}

		this.log(`X-axis inversion ${this.invertX ? 'enabled' : 'disabled'}`);
		return this.invertX;
	}

	/**
	 * Set Y-axis inversion
	 * @param {boolean} invert
	 */
	setInvertY(invert) {
		this.invertY = Boolean(invert);

		if (this._invertYCheckbox) {
			this._invertYCheckbox.checked = this.invertY;
		}

		this.log(`Y-axis inversion ${this.invertY ? 'enabled' : 'disabled'}`);
		return this.invertY;
	}

	/**
	 * Set pivot distance
	 * @param {number} distance
	 */
	setPivotDistance(distance) {
		const newDistance = Math.max(0.0, Math.min(50.0, distance));
		this.pivotDistance = newDistance;

		if (this._pivotDistanceInput) {
			this._pivotDistanceInput.value = newDistance;
		}

		this.log(`Pivot distance set to ${newDistance}cm`);
		return newDistance;
	}

	/**
	 * Set decay rate
	 * @param {number} rate
	 */
	setDecayRate(rate) {
		const newRate = Math.max(0.0, Math.min(1.0, rate));
		this.decayRate = newRate;

		if (this._decayRateInput) {
			this._decayRateInput.value = newRate;
		}

		this.log(`Decay rate set to ${newRate}`);
		return newRate;
	}

	/**
	 * Get current pose
	 * @returns {Object} Current pose angles in radians
	 */
	getPose() {
		return {
			pitch: this.pitch,
			yaw: this.yaw
		};
	}

	/**
	 * Set pose using pitch and yaw angles
	 * @param {number} pitch - Rotation around Y axis (forward/back tilt)
	 * @param {number} yaw - Rotation around world vertical
	 */
	setPose(pitch, yaw) {
		this.pitch = pitch;
		this.yaw = yaw;
		this.targetPitch = pitch;
		this.targetYaw = yaw;
		this._updatePoseDisplay();

		this.log(`Pose set to pitch: ${pitch.toFixed(3)}, yaw: ${yaw.toFixed(3)}`);
		return this.getPose();
	}

	/**
	 * Handle mouse movement events
	 * @private
	 */
	_onMouseMove(event) {
		if (!this.isCapturing || !this.pointerLocked || !this.enabled) {
			return;
		}

		// Get mouse movement deltas
		const deltaX = event.movementX || 0;
		const deltaY = event.movementY || 0;

		// Apply sensitivity and inversion
		const sensitivityFactor = this.sensitivity; // Base sensitivity scaling
		let yawDelta = deltaX * sensitivityFactor;
		let pitchDelta = -deltaY * sensitivityFactor;

		if (this.invertX) {
			yawDelta = -yawDelta;
		}
		if (this.invertY) {
			pitchDelta = -pitchDelta;
		}

		// Update target pose
		this.targetYaw += yawDelta / this.circleUnits;
		this.targetPitch += pitchDelta / this.circleUnits;

		// Clamp pitch to reasonable range (prevent over-rotation)
		this.targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetPitch));

		if (Math.abs(this.targetPitch) < (Math.PI / 2.01)) {
			// Accumulate mouse movement for gyro calculation
			this.accumulatedMouseX += yawDelta;
			this.accumulatedMouseY += pitchDelta;
		}

		this._updatePoseDisplay();
	}

	/**
	 * Handle pointer lock change events
	 * @private
	 */
	_onPointerLockChange() {
		this.pointerLocked = document.pointerLockElement === document.body;

		if (!this.pointerLocked && this.isCapturing) {
			this.isCapturing = false;
			this.log('Pointer lock lost, stopping capture');
		}

		this._updateUI();
	}

	/**
	 * Handle pointer lock error events
	 * @private
	 */
	_onPointerLockError() {
		this.log('Pointer lock failed');
		this.isCapturing = false;
		this.pointerLocked = false;
		this._updateUI();
	}

	/**
	 * Update UI elements to reflect current state
	 * @private
	 */
	_updateUI() {
		if (this._captureButton) {
			this._captureButton.textContent = this.isCapturing ? 'Stop Capture' : 'Start Capture';
			this._captureButton.className = this.isCapturing ? 'button small active' : 'button small';
		}

		if (this._statusDisplay) {
			const status = this.pointerLocked ? 'Capturing' : (this.isCapturing ? 'Waiting...' : 'Inactive');
			this._statusDisplay.textContent = `Status: ${status}`;
			this._statusDisplay.className = `mouseMotion-status ${this.pointerLocked ? 'active' : ''}`;
		}
	}

	/**
	 * Update pose display
	 * @private
	 */
	_updatePoseDisplay() {
		if (this._poseDisplay) {
			const pitchDeg = (this.pitch * 180 / Math.PI).toFixed(1);
			const yawDeg = (this.yaw * 180 / Math.PI).toFixed(1);
			this._poseDisplay.textContent = `Pitch: ${pitchDeg}° Yaw: ${yawDeg}°`;
		}
	}

	// Add this method to your MouseMotion class
	_applyPitchDecay(deltaTime) {
		if (this.decayRate <= 0 || deltaTime <= 0) {
			return 0; // Return decay angular velocity for gyro calculation
		}

		// Calculate decay amount based on deltaTime
		const decayFactor = 1 - Math.pow(1 - this.decayRate, deltaTime / 16.67); // Normalize to 60fps

		// Calculate how much pitch will decay this frame
		const pitchDecayAmount = this.targetPitch * decayFactor / 10;
		const decayAngularVelocity = pitchDecayAmount / (deltaTime / 1000); // Convert to rad/s

		// Apply decay to both target and current pitch
		this.targetPitch -= pitchDecayAmount;
		this.pitch -= pitchDecayAmount;

		return decayAngularVelocity; // Return for gyro calculation
	}

	/**
	 * Calculate angular velocities from accumulated mouse movement
	 * @private
	 */
	_calculateAngularVelocities(deltaTime) {
		if (deltaTime <= 0) {
			return { gyroX: 0, gyroY: 0, gyroZ: 0 };
		}

		// Calculate conversion to rad/s
		const scaleFactor = (1000) / (deltaTime * this.circleUnits);
		// Calculate angular velocities in rad/s from accumulated movement
		const angularVelPitch = this.accumulatedMouseY * scaleFactor;
		const angularVelYaw = this.accumulatedMouseX * scaleFactor;

		// Mouse Y movement -> Y gyro (pitch around Y axis)
		// Mouse up = negative deltaY = positive pitch = negative Y gyro
		const gyroY = -angularVelPitch;

		// Mouse X movement -> gyro in X-Z plane based on current pitch
		// Mouse right = positive deltaX = clockwise yaw = negative Z gyro (when flat)
		const cosPitch = Math.cos(this.pitch);
		const sinPitch = Math.sin(this.pitch);

		const gyroZ = -angularVelYaw * cosPitch;
		const gyroX = -angularVelYaw * sinPitch;

		// Clear accumulated movement for next frame
		this.accumulatedMouseX = 0;
		this.accumulatedMouseY = 0;

		return { gyroX, gyroY, gyroZ };
	}

	/**
	 * Apply gravity based on current pose
	 * @private
	 */
	_applyGravityToIMU(imuSample) {
		// Gravity always points down in world coordinates
		// In gamepad coordinates: X=away, Y=left, Z=up
		// So world gravity is (0, 0, -9.81)

		// Apply pitch rotation to gravity vector
		// When pitch=0: gravity = (0, 0, -9.81) -> accel = (0, 0, 9.81)
		// When pitch=π/2: gravity rotated -> accel = (9.81, 0, 0)
		// When pitch=-π/2: gravity rotated -> accel = (-9.81, 0, 0)

		const cosPitch = Math.cos(this.pitch);
		const sinPitch = Math.sin(this.pitch);

		// Gravity in gamepad coordinates after pitch rotation
		imuSample.accelX = 9.81 * sinPitch;
		imuSample.accelY = 0; // Y axis is rotation axis, no gravity component
		imuSample.accelZ = 9.81 * cosPitch;
	}

	/**
	 * Calculate additional acceleration from elbow pivot motion
	 * @private
	 */
	_calculateElbowPivotAcceleration(angularVelocities, deltaTime) {
		if (deltaTime <= 0) {
			return { accelX: 0, accelY: 0, accelZ: 0 };
		}

		// Pivot point is pivotDistance cm in negative X direction from gamepad,
		// so the IMU's coordinate is the pivotDistance.
		const relX = this.pivotDistance / 100; // cm to m

		// Calculate centripetal acceleration due to current angular velocities.
		// Centripetal acceleration is simplified to only affect X (away from player).
		// Total relevant angular velocity is Y + Z; Z is already diminished by sine of pitch.
		// Technically should be L2 norm, but this doesn't have to be exact.
		const totalAngularVelocity = angularVelocities.gyroY + angularVelocities.gyroZ;
		const pitchCentripetalX = totalAngularVelocity * totalAngularVelocity * relX;

		// Calculate angular accelerations
		const pitchAccel = 1000 * (angularVelocities.gyroY - this.prevAngularVelocities.gyroY) / deltaTime;
		const yawAccel = 1000 * (angularVelocities.gyroZ - this.prevAngularVelocities.gyroZ) / deltaTime;

		// Pitch angular acceleration (around Y axis) causes tangential
		// acceleration in Z
		const pitchTangentialZ = 0 - pitchAccel * relX;

		// Yaw angular acceleration causes tangential acceleration in Y.
		// Yaw is simplified to Z axis, because as the player brings their arms
		// up, pivot distance would decrease in the same way that Z rotation
		// already has.  Yaw affect on Z is ignored for the same reason.
		const yawTangentialY = yawAccel * relX;

		// Total additional acceleration
		const accelX = pitchCentripetalX;
		const accelY = yawTangentialY;
		const accelZ = pitchTangentialZ;

		this.prevAngularVelocities = angularVelocities;
		return { accelX, accelY, accelZ };
	}

	_processInternal(state, deltaTime) {
		// Apply pitch decay and get the decay angular velocity
		const decayAngularVel = this._applyPitchDecay(deltaTime);
		// Calculate angular velocities from accumulated mouse movement
		const angularVelocities = this._calculateAngularVelocities(deltaTime);

		// Apply smoothing to pose if enabled
		if (this.smoothing > 0) {
			const dt = deltaTime / 16.67; // Normalize to 60fps
			const lerpFactor = Math.min(1, dt * (1 - this.smoothing));
			this.pitch += (this.targetPitch - this.pitch) * lerpFactor;
			this.yaw += (this.targetYaw - this.yaw) * lerpFactor;
		} else {
			this.pitch = this.targetPitch;
			this.yaw = this.targetYaw;
		}

		// Set gyro values directly from calculated angular velocities
		state.imuSample.gyroX = angularVelocities.gyroX;
		state.imuSample.gyroY = angularVelocities.gyroY - decayAngularVel;
		state.imuSample.gyroZ = angularVelocities.gyroZ;

		// Apply gravity based on pose
		this._applyGravityToIMU(state.imuSample);

		// Add elbow pivot acceleration if enabled
		if (this.pivotDistance > 0) {
			const pivotAccel = this._calculateElbowPivotAcceleration(angularVelocities, deltaTime);
			state.imuSample.accelX += pivotAccel.accelX;
			state.imuSample.accelY += pivotAccel.accelY;
			state.imuSample.accelZ += pivotAccel.accelZ;
		}

		// Update pose display
		this._updatePoseDisplay();

		return state;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls mouseMotion-custom';

		// Capture control section
		const captureDiv = document.createElement('div');
		captureDiv.className = 'manipulator-control-group';

		this._captureButton = document.createElement('button');
		this._captureButton.textContent = 'Start Capture';
		this._captureButton.className = 'button small';
		this._captureButton.addEventListener('click', () => {
			this.executeAction('toggleCapture');
		});

		this._statusDisplay = document.createElement('div');
		this._statusDisplay.textContent = 'Status: Inactive';
		this._statusDisplay.className = 'mouseMotion-status';

		const resetButton = document.createElement('button');
		resetButton.textContent = 'Reset Pose';
		resetButton.className = 'button small';
		resetButton.addEventListener('click', () => {
			this.executeAction('resetPose');
		});

		captureDiv.appendChild(this._captureButton);
		captureDiv.appendChild(resetButton);
		captureDiv.appendChild(this._statusDisplay);

		// Pose display
		const poseDiv = document.createElement('div');
		poseDiv.className = 'manipulator-control-group';

		this._poseDisplay = document.createElement('div');
		this._poseDisplay.className = 'mouseMotion-pose-display';
		this._poseDisplay.textContent = 'Pitch: 0.0° Yaw: 0.0° (Direct)';

		poseDiv.appendChild(this._poseDisplay);

		// Sensitivity control
		const sensitivityDiv = document.createElement('div');
		sensitivityDiv.className = 'inline-with-gap';

		const sensitivityLabel = document.createElement('label');
		sensitivityLabel.textContent = 'Sensitivity:';

		this._sensitivityInput = document.createElement('input');
		this._sensitivityInput.type = 'range';
		this._sensitivityInput.min = '0.1';
		this._sensitivityInput.max = '3.0';
		this._sensitivityInput.step = '0.1';
		this._sensitivityInput.value = this.sensitivity;

		const sensitivityValue = document.createElement('span');
		sensitivityValue.textContent = this.sensitivity.toFixed(1);
		sensitivityValue.className = 'mouseMotion-value-display';

		this._sensitivityInput.addEventListener('input', () => {
			const newSensitivity = parseFloat(this._sensitivityInput.value);
			sensitivityValue.textContent = newSensitivity.toFixed(1);
			this.executeAction('setSensitivity', { sensitivity: newSensitivity });
		});

		sensitivityDiv.appendChild(sensitivityLabel);
		sensitivityDiv.appendChild(this._sensitivityInput);
		sensitivityDiv.appendChild(sensitivityValue);

		// Smoothing control
		const smoothingDiv = document.createElement('div');
		smoothingDiv.className = 'inline-with-gap';

		const smoothingLabel = document.createElement('label');
		smoothingLabel.textContent = 'Smoothing:';

		this._smoothingInput = document.createElement('input');
		this._smoothingInput.type = 'range';
		this._smoothingInput.min = '0';
		this._smoothingInput.max = '0.1';
		this._smoothingInput.step = '0.05';
		this._smoothingInput.value = this.smoothing;

		const smoothingValue = document.createElement('span');
		smoothingValue.textContent = this.smoothing.toFixed(2);
		smoothingValue.className = 'mouseMotion-value-display';

		this._smoothingInput.addEventListener('input', () => {
			const newSmoothing = parseFloat(this._smoothingInput.value);
			smoothingValue.textContent = newSmoothing.toFixed(2);
			this.executeAction('setSmoothing', { smoothing: newSmoothing });
		});

		smoothingDiv.appendChild(smoothingLabel);
		smoothingDiv.appendChild(this._smoothingInput);
		smoothingDiv.appendChild(smoothingValue);

		// Pivot distance control
		const pivotDistanceDiv = document.createElement('div');
		pivotDistanceDiv.className = 'inline-with-gap';

		const pivotDistanceLabel = document.createElement('label');
		pivotDistanceLabel.textContent = 'Pivot Distance:';

		this._pivotDistanceInput = document.createElement('input');
		this._pivotDistanceInput.type = 'range';
		this._pivotDistanceInput.min = '0';
		this._pivotDistanceInput.max = '50';
		this._pivotDistanceInput.step = '5';
		this._pivotDistanceInput.value = this.pivotDistance;

		const pivotDistanceValue = document.createElement('span');
		pivotDistanceValue.textContent = this.pivotDistance.toFixed(0) + 'cm';
		pivotDistanceValue.className = 'mouseMotion-value-display';

		this._pivotDistanceInput.addEventListener('input', () => {
			const newDistance = parseFloat(this._pivotDistanceInput.value);
			pivotDistanceValue.textContent = newDistance.toFixed(0) + 'cm';
			this.executeAction('setPivotDistance', { distance: newDistance });
		});

		pivotDistanceDiv.appendChild(pivotDistanceLabel);
		pivotDistanceDiv.appendChild(this._pivotDistanceInput);
		pivotDistanceDiv.appendChild(pivotDistanceValue);

		// Decay rate control
		const decayRateDiv = document.createElement('div');
		decayRateDiv.className = 'inline-with-gap';

		const decayRateLabel = document.createElement('label');
		decayRateLabel.textContent = 'Pitch Decay:';

		this._decayRateInput = document.createElement('input');
		this._decayRateInput.type = 'range';
		this._decayRateInput.min = '0';
		this._decayRateInput.max = '1';
		this._decayRateInput.step = '.1';
		this._decayRateInput.value = this.decayRate;

		const decayRateValue = document.createElement('span');
		decayRateValue.textContent = this.decayRate.toFixed(1);
		decayRateValue.className = 'mouseMotion-value-display';

		this._decayRateInput.addEventListener('input', () => {
			const newDistance = parseFloat(this._decayRateInput.value);
			decayRateValue.textContent = newDistance.toFixed(1);
			this.executeAction('setDecayRate', { rate: newDistance });
		});

		decayRateDiv.appendChild(decayRateLabel);
		decayRateDiv.appendChild(this._decayRateInput);
		decayRateDiv.appendChild(decayRateValue);

		// Inversion controls
		const inversionDiv = document.createElement('div');
		inversionDiv.className = 'manipulator-control-group';

		const invertXLabel = document.createElement('label');
		invertXLabel.className = 'manipulator-label';
		this._invertXCheckbox = document.createElement('input');
		this._invertXCheckbox.type = 'checkbox';
		this._invertXCheckbox.checked = this.invertX;
		this._invertXCheckbox.addEventListener('change', () => {
			this.executeAction('setInvertX', { invert: this._invertXCheckbox.checked });
		});
		const invertXText = document.createElement('span');
		invertXText.textContent = 'Invert X-axis (yaw)';
		invertXLabel.appendChild(this._invertXCheckbox);
		invertXLabel.appendChild(invertXText);

		const invertYLabel = document.createElement('label');
		invertYLabel.className = 'manipulator-label';
		this._invertYCheckbox = document.createElement('input');
		this._invertYCheckbox.type = 'checkbox';
		this._invertYCheckbox.checked = this.invertY;
		this._invertYCheckbox.addEventListener('change', () => {
			this.executeAction('setInvertY', { invert: this._invertYCheckbox.checked });
		});
		const invertYText = document.createElement('span');
		invertYText.textContent = 'Invert Y-axis (pitch)';
		invertYLabel.appendChild(this._invertYCheckbox);
		invertYLabel.appendChild(invertYText);

		const resetOnCaptureLabel = document.createElement('label');
		resetOnCaptureLabel.className = 'manipulator-label';
		this._resetOnCaptureCheckbox = document.createElement('input');
		this._resetOnCaptureCheckbox.type = 'checkbox';
		this._resetOnCaptureCheckbox.checked = this.resetOnCapture;
		this._resetOnCaptureCheckbox.addEventListener('change', () => {
			this.resetOnCapture = this._resetOnCaptureCheckbox.checked;
		});
		const resetOnCaptureText = document.createElement('span');
		resetOnCaptureText.textContent = 'Reset pose on capture';
		resetOnCaptureLabel.appendChild(this._resetOnCaptureCheckbox);
		resetOnCaptureLabel.appendChild(resetOnCaptureText);

		inversionDiv.appendChild(invertXLabel);
		inversionDiv.appendChild(invertYLabel);
		inversionDiv.appendChild(resetOnCaptureLabel);

		// Help text
		const helpDiv = document.createElement('div');
		helpDiv.className = 'mouseMotion-help';
		helpDiv.innerHTML = `
			<strong>Usage:</strong> Click "Start Capture" to lock the mouse cursor. 
			Move the mouse to control controller orientation:<br>
			• Up-Down = Pitch (tilt forward/backward)<br>
			• Left-Right = Yaw (turn left/right)<br>
			• Pivot distance: Elbow-to-controller distance<br>
			• Pitch decay: Slowly brings the controller back level<br>
			Press Esc to exit capture mode.
		`;

		// Assemble the UI
		container.appendChild(captureDiv);
		container.appendChild(poseDiv);
		container.appendChild(sensitivityDiv);
		container.appendChild(smoothingDiv);
		container.appendChild(pivotDistanceDiv);
		container.appendChild(decayRateDiv);
		container.appendChild(inversionDiv);
		container.appendChild(helpDiv);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.mouseMotion-custom .mouseMotion-value-display {
				margin-left: 8px;
				font-weight: bold;
				min-width: 30px;
				display: inline-block;
			}
			
			.mouseMotion-custom input[type="range"] {
				flex: 1;
				margin: 0 8px;
			}
						
			.mouseMotion-custom label {
				min-width: 100px;
			}
			
			.mouseMotion-custom .mouseMotion-status {
				margin-top: 8px;
				padding: 4px 8px;
				background: #f0f0f00f;
				border-radius: 4px;
				font-size: 0.9em;
			}
			
			.mouseMotion-custom .mouseMotion-status.active {
				background: #d4edda0f;
				color: #6fff90ff;
			}
			
			.mouseMotion-custom .mouseMotion-pose-display {
				margin-top: 8px;
				padding: 6px 8px;
				background: #e3f2fd;
				border-radius: 4px;
				font-family: monospace;
				font-size: 0.85em;
				color: #1565c0;
				text-align: center;
			}
						
			.mouseMotion-custom .mouseMotion-pivot-distance {
				margin-top: 8px;
				opacity: 0.6;
				transition: opacity 0.3s ease;
			}
			
			.mouseMotion-custom .mouseMotion-pivot-distance.enabled {
				opacity: 1;
			}
			
			.mouseMotion-custom .mouseMotion-help {
				margin-top: 8px;
				padding: 8px;
				background: #e9ecef0f;
				border-radius: 4px;
				font-size: 0.85em;
				line-height: 1.4;
			}
			
			.mouseMotion-custom .button.active {
				background: #28a745;
				color: white;
			}
		`;
		container.appendChild(style);

		// Initialize UI state
		this._updateUI();
		this._updatePoseDisplay();

		return container;
	}

	_getSpecificConfig() {
		return {
			sensitivity: this.sensitivity,
			invertX: this.invertX,
			invertY: this.invertY,
			smoothing: this.smoothing,
			resetOnCapture: this.resetOnCapture,
			pivotDistance: this.pivotDistance,
			decayRate: this.decayRate
		};
	}

	_setSpecificConfig(config) {
		if (config.sensitivity !== undefined) {
			this.sensitivity = config.sensitivity;
			if (this._sensitivityInput) {
				this._sensitivityInput.value = this.sensitivity;
				// Update display
				const sensitivityValue = this._sensitivityInput.parentNode.querySelector('.mouseMotion-value-display');
				if (sensitivityValue) {
					sensitivityValue.textContent = this.sensitivity.toFixed(1);
				}
			}
		}

		if (config.invertX !== undefined) {
			this.invertX = config.invertX;
			if (this._invertXCheckbox) {
				this._invertXCheckbox.checked = this.invertX;
			}
		}

		if (config.invertY !== undefined) {
			this.invertY = config.invertY;
			if (this._invertYCheckbox) {
				this._invertYCheckbox.checked = this.invertY;
			}
		}

		if (config.smoothing !== undefined) {
			this.smoothing = config.smoothing;
			if (this._smoothingInput) {
				this._smoothingInput.value = this.smoothing;
				// Update display
				const smoothingValue = this._smoothingInput.parentNode.querySelector('.mouseMotion-value-display');
				if (smoothingValue) {
					smoothingValue.textContent = this.smoothing.toFixed(2);
				}
			}
		}

		if (config.resetOnCapture !== undefined) {
			this.resetOnCapture = config.resetOnCapture;
			if (this._resetOnCaptureCheckbox) {
				this._resetOnCaptureCheckbox.checked = this.resetOnCapture;
			}
		}

		if (config.pivotDistance !== undefined) {
			this.pivotDistance = config.pivotDistance;
			if (this._pivotDistanceInput) {
				this._pivotDistanceInput.value = this.pivotDistance;
				// Update display
				const pivotDistanceValue = this._pivotDistanceInput.parentNode.querySelector('.mouseMotion-value-display');
				if (pivotDistanceValue) {
					pivotDistanceValue.textContent = this.pivotDistance.toFixed(0) + 'cm';
				}
			}
		}

		if (config.decayRate !== undefined) {
			this.decayRate = config.decayRate;
			if (this._decayRateInput) {
				this._decayRateInput.value = this.decayRate;
				// Update display
				const decayRateValue = this._decayRateInput.parentNode.querySelector('.mouseMotion-value-display');
				if (decayRateValue) {
					decayRateValue.textContent = this.decayRate.toFixed(1);
				}
			}
		}
	}

	onAttach() {
		// Add event listeners for pointer lock
		document.addEventListener('pointerlockchange', this._pointerLockChangeHandler);
		document.addEventListener('pointerlockerror', this._pointerLockErrorHandler);
		document.addEventListener('mousemove', this._mouseMoveHandler);
	}

	onDetach() {
		// Stop capture and remove event listeners
		this.stopCapture();
		document.removeEventListener('pointerlockchange', this._pointerLockChangeHandler);
		document.removeEventListener('pointerlockerror', this._pointerLockErrorHandler);
		document.removeEventListener('mousemove', this._mouseMoveHandler);
	}

	onEnabledChanged(enabled) {
		if (!enabled) {
			// Stop capture when disabled
			this.stopCapture();
		}
	}

	dispose() {
		super.dispose();
		this.onDetach();
		this._captureButton = null;
		this._sensitivityInput = null;
		this._smoothingInput = null;
		this._invertXCheckbox = null;
		this._invertYCheckbox = null;
		this._resetOnCaptureCheckbox = null;
		this._pivotDistanceInput = null;
		this._decayRateInput = null;
		this._statusDisplay = null;
		this._poseDisplay = null;
	}
}