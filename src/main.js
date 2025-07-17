// ./src/main.js

// Import all the modules
import { ControllerState } from './core/ControllerState.js';
import { SwiCCSink } from './core/SwiCCSink.js';
import { GamepadSource } from './sources/GamepadSource.js';
import { Engine } from './core/Engine.js';
import { ManipulatorPipeline } from './manipulators/ManipulatorPipeline.js';
import { ActionMessageHandler } from './core/ActionMessageHandler.js';

// Global app state
let engine = null;
let swiccSinks = new Map();
let gamepadSource = null;
let pipeline = null;           // Updated: Use pipeline directly
let messageHandler = null;

// DOM elements
const serialStatus = document.getElementById('serialStatus');
const gamepadName = document.getElementById('gamepadName');
const messageLog = document.getElementById('messageLog');
const gpButtonGrid = document.getElementById('gpButtonGrid');
const leftStick = document.getElementById('leftStick');
const rightStick = document.getElementById('rightStick');
const connectedCount = document.getElementById('connectedCount');
const addMoreSwiCCsBtn = document.getElementById('addMoreSwiCCsBtn');
const additionalSwiCCs = document.getElementById('additionalSwiCCs');

// Configuration load/store control elements
const presetSelector = document.getElementById('presetSelector');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const configName = document.getElementById('configName');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const configSelector = document.getElementById('configSelector');
const loadConfigBtn = document.getElementById('loadConfigBtn');
const deleteConfigBtn = document.getElementById('deleteConfigBtn');
const exportConfigBtn = document.getElementById('exportConfigBtn');
const importConfigBtn = document.getElementById('importConfigBtn');
const importFileInput = document.getElementById('importFileInput');
const configStatus = document.getElementById('configStatus');

// Pipeline control elements
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const toggleControlsIcon = document.getElementById('toggleControlsIcon');
const pipelineControls = document.getElementById('pipelineControls');
const clearPipelineBtn = document.getElementById('clearPipelineBtn');
const pipelineContainer = document.getElementById('pipelineContainer');

// Initialize the app
function init() {
	logMessage('System initialized');

	// Create engine with unified pipeline
	engine = new Engine({ frameRate: 60 });
	pipeline = engine.getPipeline(); // Get the pipeline directly from engine

	// Create message handler - now uses the pipeline directly
	messageHandler = new ActionMessageHandler(pipeline);

	// Setup pipeline event listeners
	pipeline.on('registered', (data) => {
		const id = pipeline.getId(data.manipulator);
		logMessage(`Manipulator registered: ${data.manipulator.constructor.displayName}`);
	});

	pipeline.on('unregistered', (data) => {
		logMessage(`Manipulator unregistered: ${data.manipulator.constructor.displayName} ${data.previousIndex}`);
	});

	pipeline.on('actionExecuted', (data) => {
		logMessage(`Action executed: ${data.actionName} on ${data.manipulator.constructor.displayName}`);
	});

	// Add static gamepad source
	gamepadSource = new GamepadSource(0);
	engine.addSource('gamepad0', gamepadSource);

	// Setup default pipeline
	loadPipelinePreset('default');

	// Set up config load/store
	updateConfigSelector();
	initializeConfigCollapse();

	// Setup event listeners
	setupEventListeners();

	// Initialize button grid
	initgpButtonGrid();

	// Generate manipulator buttons dynamically
	generateManipulatorButtons();

	// Start monitoring
	startMonitoring();

	// Setup message listeners (example using BroadcastChannel)
	setupMessageListeners();

	logMessage('Ready to connect');
}

// Generate manipulator buttons dynamically based on registry
function generateManipulatorButtons() {
	// Clear existing buttons
	pipelineControls.innerHTML = '';

	// Create a button for each registered manipulator type
	for (const type of ManipulatorPipeline.MANIPULATOR_REGISTRY) {
		const button = document.createElement('button');
		button.className = 'button';
		button.textContent = `${type.displayName}`;
		button.addEventListener('click', () => addManipulator(type.name));
		pipelineControls.appendChild(button);
	}
}

// Pipeline presets
const PIPELINE_PRESETS = {
	default: {
		name: 'Default',
		description: 'Passthrough with controller display',
		pipeline: [
			{ type: 'DisplayBroadcaster', config: { highlightType: 'controller-state-outer' } },
			{ type: 'DisplayBroadcaster', config: { highlightType: 'controller-state-inner' } },
		]
	},
	TwitchControl: {
		name: 'Twitch Control',
		description: 'Display and Twitch Chat control',
		pipeline: [
			{ type: 'DisplayBroadcaster', config: { highlightType: 'controller-state-outer' } },
			{ type: 'ChatCommand', config: {} },
			{ type: 'DisplayBroadcaster', config: { highlightType: 'controller-state-inner' } },
		]
	},
	// Add more presets here
};

function loadPipelinePreset(presetName) {
	const preset = PIPELINE_PRESETS[presetName];
	if (!preset) {
		logMessage(`Preset '${presetName}' not found`);
		return;
	}

	// Clear existing pipeline
	clearPipeline();

	// Load preset pipeline
	preset.pipeline.forEach(({ type, config }) => {
		addManipulator(type, config);
	});

	logMessage(`Loaded preset: ${preset.name} - ${preset.description}`);
}

let hideStatusTimeout;
function showConfigStatus(message, type = 'info') {
	configStatus.textContent = message;
	configStatus.className = `config-status ${type}`;
	configStatus.style.display = '';

	// If there’s already a pending hide, cancel it
	if (hideStatusTimeout) {
		clearTimeout(hideStatusTimeout);
	}

	// Auto-hide after 3 seconds
	hideStatusTimeout = setTimeout(() => {
		configStatus.style.display = 'none';
		hideStatusTimeout = null;  // clean up
	}, 3000);
}

function saveConfiguration(name) {
	if (!name || name.trim() === '') {
		showConfigStatus('Please enter a configuration name', 'error');
		return;
	}

	const config = {
		name: name.trim(),
		timestamp: new Date().toISOString(),
		version: '1.0',
		pipeline: getCurrentPipelineConfig()
	};

	try {
		const saved = JSON.parse(localStorage.getItem('swicc-configs') || '{}');
		saved[name] = config;
		localStorage.setItem('swicc-configs', JSON.stringify(saved));

		updateConfigSelector();
		showConfigStatus(`Configuration "${name}" saved successfully`, 'success');
		configName.value = '';

		logMessage(`Configuration saved: ${name}`);
	} catch (error) {
		showConfigStatus(`Error saving configuration: ${error.message}`, 'error');
		logMessage(`Save error: ${error.message}`);
	}
}

function loadConfiguration(name) {
	if (!name) {
		showConfigStatus('Please select a configuration to load', 'error');
		return;
	}

	try {
		const saved = JSON.parse(localStorage.getItem('swicc-configs') || '{}');
		const config = saved[name];

		if (!config) {
			showConfigStatus(`Configuration "${name}" not found`, 'error');
			return;
		}

		loadPipelineConfig(config.pipeline);
		showConfigStatus(`Configuration "${name}" loaded successfully`, 'success');
		logMessage(`Configuration loaded: ${name}`);

	} catch (error) {
		showConfigStatus(`Error loading configuration: ${error.message}`, 'error');
		logMessage(`Load error: ${error.message}`);
	}
}

function deleteConfiguration(name) {
	if (!name) {
		showConfigStatus('Please select a configuration to delete', 'error');
		return;
	}

	if (!confirm(`Are you sure you want to delete configuration "${name}"?`)) {
		return;
	}

	try {
		const saved = JSON.parse(localStorage.getItem('swicc-configs') || '{}');
		delete saved[name];
		localStorage.setItem('swicc-configs', JSON.stringify(saved));

		updateConfigSelector();
		showConfigStatus(`Configuration "${name}" deleted successfully`, 'success');
		logMessage(`Configuration deleted: ${name}`);

	} catch (error) {
		showConfigStatus(`Error deleting configuration: ${error.message}`, 'error');
		logMessage(`Delete error: ${error.message}`);
	}
}

function updateConfigSelector() {
	// Populate the presets
	for (const [key, preset] of Object.entries(PIPELINE_PRESETS)) {
		const option = document.createElement('option');
		option.value = key;
		option.textContent = `${preset.name} - ${preset.description}`;
		presetSelector.appendChild(option);
	}
	// Populate the saved configs
	try {
		const saved = JSON.parse(localStorage.getItem('swicc-configs') || '{}');
		const names = Object.keys(saved).sort();

		configSelector.innerHTML = '<option value="">Select saved configuration...</option>';
		names.forEach(name => {
			const option = document.createElement('option');
			option.value = name;
			option.textContent = `${name} (${new Date(saved[name].timestamp).toLocaleDateString()})`;
			configSelector.appendChild(option);
		});

		// Enable/disable buttons based on selection
		const hasConfigs = names.length > 0;
		loadConfigBtn.disabled = !configSelector.value;
		deleteConfigBtn.disabled = !configSelector.value;

	} catch (error) {
		logMessage(`Error updating config selector: ${error.message}`);
	}
}

function exportConfiguration() {
	const config = {
		name: 'Exported Configuration',
		timestamp: new Date().toISOString(),
		version: '1.0',
		pipeline: getCurrentPipelineConfig()
	};

	const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = `swicc-config-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	showConfigStatus('Configuration exported successfully', 'success');
	logMessage('Configuration exported to file');
}

function importConfiguration(file) {
	const reader = new FileReader();

	reader.onload = (e) => {
		try {
			const config = JSON.parse(e.target.result);

			// Validate config structure
			if (!config.pipeline || !Array.isArray(config.pipeline)) {
				throw new Error('Invalid configuration format');
			}

			// Load the configuration
			loadPipelineConfig(config.pipeline);
			showConfigStatus(`Configuration imported successfully`, 'success');
			logMessage('Configuration imported from file');

		} catch (error) {
			showConfigStatus(`Error importing configuration: ${error.message}`, 'error');
			logMessage(`Import error: ${error.message}`);
		}
	};

	reader.onerror = () => {
		showConfigStatus('Error reading file', 'error');
	};

	reader.readAsText(file);
}

function setupEventListeners() {
	// Setup SwiCC connection buttons for all 4 possible connections
	for (let i = 0; i < 4; i++) {
		const connectBtn = document.getElementById(`connectBtn${i}`);
		const disconnectBtn = document.getElementById(`disconnectBtn${i}`);

		if (connectBtn && disconnectBtn) {
			connectBtn.addEventListener('click', () => connectToSwiCC(i));
			disconnectBtn.addEventListener('click', () => disconnectFromSwiCC(i));
		}
	}

	// Add more SwiCCs button
	addMoreSwiCCsBtn.addEventListener('click', () => {
		additionalSwiCCs.style.display = additionalSwiCCs.style.display === 'none' ? 'block' : 'none';
		addMoreSwiCCsBtn.textContent = additionalSwiCCs.style.display === 'none' ?
			'Add More SwiCCs' : 'Hide Additional SwiCCs';
	});

	// Toggle pipeline controls visibility
	toggleControlsBtn.addEventListener('click', () => {
		const isVisible = pipelineControls.style.display !== 'none';
		pipelineControls.style.display = isVisible ? 'none' : '';
		toggleControlsIcon.textContent = isVisible ? '▷' : '▽';
	});

	// Clear pipeline button
	clearPipelineBtn.addEventListener('click', clearPipeline);

	loadPresetBtn.addEventListener('click', () => {
		const preset = presetSelector.value;
		if (preset) {
			loadPipelinePreset(preset);
			showConfigStatus(`Preset "${preset}" loaded`, 'success');
		}
	});

	saveConfigBtn.addEventListener('click', () => {
		saveConfiguration(configName.value);
	});

	loadConfigBtn.addEventListener('click', () => {
		loadConfiguration(configSelector.value);
	});

	deleteConfigBtn.addEventListener('click', () => {
		deleteConfiguration(configSelector.value);
	});

	exportConfigBtn.addEventListener('click', exportConfiguration);

	importConfigBtn.addEventListener('click', () => {
		importFileInput.click();
	});

	importFileInput.addEventListener('change', (e) => {
		const file = e.target.files[0];
		if (file) {
			importConfiguration(file);
		}
	});

	configSelector.addEventListener('change', () => {
		loadConfigBtn.disabled = !configSelector.value;
		deleteConfigBtn.disabled = !configSelector.value;
	});
}

// Setup message listeners for external control
function setupMessageListeners() {
	// Example using BroadcastChannel for cross-tab communication
	const controlChannel = new BroadcastChannel('swicc-control');

	controlChannel.addEventListener('message', async (event) => {
		const response = await messageHandler.process(event.data);
		controlChannel.postMessage(response);
	});

	// Example using window message events
	window.addEventListener('message', async (event) => {
		// Validate origin if needed
		if (event.data.type && event.data.type.startsWith('swicc-')) {
			const response = await messageHandler.process(event.data);
			event.source.postMessage(response, event.origin);
		}
	});

	logMessage('Message listeners initialized');
}

// Updated addManipulator function
function addManipulator(type, customConfig = {}) {
	const Ctor = ManipulatorPipeline.MANIPULATOR_REGISTRY.find(c => c.name === type);
	if (!Ctor) {
		logMessage(`Unknown manipulator type: ${type}`);
		return;
	}
	// Create manipulator instance
	const manipulator = new Ctor(customConfig);
	manipulator.setLogger(logMessage);

	// Add to pipeline (this will trigger the 'registered' event)
	pipeline.add(manipulator);

	// Add to UI
	addManipulatorToUI(manipulator);

	logMessage(`Added ${manipulator.constructor.displayName}`);

	return manipulator; // Return for external use
}

function addManipulatorToUI(manipulator) {
	// Create UI container
	const manipulatorDiv = document.createElement('div');
	manipulatorDiv.className = 'manipulator-wrapper';

	// Add manipulator footer
	const controlsDiv = document.createElement('div');
	controlsDiv.className = 'manipulator-footer';

	const removeBtn = document.createElement('button');
	removeBtn.className = 'button danger small';
	removeBtn.textContent = 'Remove';
	removeBtn.addEventListener('click', () => removeManipulator(manipulator, manipulatorDiv));

	const moveUpBtn = document.createElement('button');
	moveUpBtn.className = 'button small';
	moveUpBtn.textContent = '⬆️ Up';
	moveUpBtn.addEventListener('click', () => moveManipulator(manipulator, manipulatorDiv, -1));

	const moveDownBtn = document.createElement('button');
	moveDownBtn.className = 'button small';
	moveDownBtn.textContent = '⬇️ Down';
	moveDownBtn.addEventListener('click', () => moveManipulator(manipulator, manipulatorDiv, 1));

	controlsDiv.appendChild(moveUpBtn);
	controlsDiv.appendChild(moveDownBtn);
	controlsDiv.appendChild(removeBtn);

	// Add the manipulator's UI
	manipulator.createUI(manipulatorDiv);

	// Add controls to the manipulator wrapper
	manipulatorDiv.appendChild(controlsDiv);

	// Add to pipeline container
	pipelineContainer.appendChild(manipulatorDiv);

	// Store references for cleanup
	manipulator._uiElement = manipulatorDiv;
}

// Updated removeManipulator function
function removeManipulator(manipulator, uiElement) {
	// Remove from pipeline (this will trigger the 'unregistered' event)
	pipeline.remove(manipulator);

	// Remove from UI
	if (uiElement && uiElement.parentNode) {
		uiElement.parentNode.removeChild(uiElement);
	}

	// Cleanup manipulator
	if (manipulator.dispose) {
		manipulator.dispose();
	}
}

function moveManipulator(manipulator, uiElement, direction) {
	const allManipulators = pipeline.getManipulators();
	const currentIndex = allManipulators.indexOf(manipulator);
	const newIndex = currentIndex + direction;

	// Check bounds
	if (newIndex < 0 || newIndex >= allManipulators.length) {
		return;
	}

	// Move in pipeline (this will trigger the 'moved' event)
	pipeline.move(manipulator, newIndex);

	// Move in UI
	const container = pipelineContainer;
	const allElements = Array.from(container.children);

	if (direction > 0) {
		// Moving down - insert after the element at newIndex
		if (newIndex >= allElements.length - 1) {
			// Moving to the end
			container.appendChild(uiElement);
		} else {
			// Insert after the element that's currently at newIndex
			const targetElement = allElements[newIndex];
			if (targetElement.nextSibling) {
				container.insertBefore(uiElement, targetElement.nextSibling);
			} else {
				container.appendChild(uiElement);
			}
		}
	} else {
		// Moving up - insert before the element at newIndex
		const targetElement = allElements[newIndex];
		container.insertBefore(uiElement, targetElement);
	}

	// Log with position info
	const id = pipeline.getId(manipulator);
	logMessage(`Moved ${manipulator.title} ${direction > 0 ? 'down' : 'up'} to position ${newIndex} (${id})`);
}

function clearPipeline() {
	// Get all manipulators from pipeline
	const allManipulators = pipeline.getManipulators();

	// Remove each manipulator
	allManipulators.forEach(manipulator => {
		removeManipulator(manipulator, manipulator._uiElement, manipulator._type);
	});

	// Clear container
	pipelineContainer.innerHTML = '';

	logMessage('Pipeline cleared');
}

function getCurrentPipelineConfig() {
	// Export current pipeline configuration for saving
	return pipeline.getManipulators().map(m => ({
		type: m.constructor.name,
		config: m.getConfig ? m.getConfig() : {}
	}));
}

function loadPipelineConfig(config) {
	// Load a saved pipeline configuration
	clearPipeline();
	config.forEach(({ type, config }) => {
		addManipulator(type, config);
	});
}

// Execute action helper function
async function executeManipulatorAction(manipulatorId, actionName, params) {
	try {
		const result = pipeline.executeAction(manipulatorId, actionName, params);
		logMessage(`Executed ${actionName} on ${manipulatorId}: ${JSON.stringify(result)}`);
		return result;
	} catch (error) {
		logMessage(`Action error: ${error.message}`);
		throw error;
	}
}

function initgpButtonGrid() {
	const buttons = [
		'Y', 'X', 'B', 'A',
		'L', 'R', 'ZL', 'ZR',
		'−', '+', 'h', 'c',
		'↑', '↓', '←', '→'
	];

	gpButtonGrid.innerHTML = buttons.map(btn =>
		`<div class="button-indicator" data-button="${btn}">${btn}</div>`
	).join('');
}

async function connectToSwiCC(swiccId) {
	try {
		const connectBtn = document.getElementById(`connectBtn${swiccId}`);
		const disconnectBtn = document.getElementById(`disconnectBtn${swiccId}`);
		const statusElement = document.getElementById(`swiccStatus${swiccId}`);

		connectBtn.disabled = true;
		logMessage(`Requesting serial port for SwiCC #${swiccId + 1}...`);

		// Create SwiCC sink
		const swiccSink = new SwiCCSink({
			onDisconnect: () => {
				logMessage(`SwiCC #${swiccId + 1} disconnected`);
				updateSwiCCConnectionStatus(swiccId, false);
			},
			logMessage: (msg) => {
				logMessage(`SwiCC #${swiccId + 1}: ${msg}`);
			},
		});

		// Connect to port
		await swiccSink.connect();

		// Store the sink
		swiccSinks.set(swiccId, swiccSink);

		// Add sink to engine
		engine.addSink(`swicc${swiccId}`, swiccSink);

		updateSwiCCConnectionStatus(swiccId, true);
		logMessage(`Connected to SwiCC #${swiccId + 1} successfully!`);

	} catch (error) {
		logMessage(`SwiCC #${swiccId + 1} connection failed: ${error.message}`);
		document.getElementById(`connectBtn${swiccId}`).disabled = false;
	}
}

async function disconnectFromSwiCC(swiccId) {
	try {
		const swiccSink = swiccSinks.get(swiccId);

		if (swiccSink) {

			// Remove from engine
			engine.removeSink(`swicc${swiccId}`);

			// Disconnect
			await swiccSink.disconnect();

			// Remove from tracking
			swiccSinks.delete(swiccId);
		}

		// Stop engine if no more connections
		if (swiccSinks.size === 0) {
			engine.stop();
			logMessage('Engine stopped - no SwiCC connections remaining');
		}

		updateSwiCCConnectionStatus(swiccId, false);
		logMessage(`Disconnected from SwiCC #${swiccId + 1}`);

	} catch (error) {
		logMessage(`SwiCC #${swiccId + 1} disconnect error: ${error.message}`);
	}
}

function updateSwiCCConnectionStatus(swiccId, connected) {
	const connectBtn = document.getElementById(`connectBtn${swiccId}`);
	const disconnectBtn = document.getElementById(`disconnectBtn${swiccId}`);
	const statusElement = document.getElementById(`swiccStatus${swiccId}`);

	if (connected) {
		connectBtn.disabled = true;
		disconnectBtn.disabled = false;
		statusElement.textContent = 'Connected';
		statusElement.className = 'swicc-status connected';
	} else {
		connectBtn.disabled = false;
		disconnectBtn.disabled = true;
		statusElement.textContent = 'Disconnected';
		statusElement.className = 'swicc-status disconnected';
	}

	// Update connected count
	connectedCount.textContent = swiccSinks.size;

	// Update overall serial status indicator
	if (swiccSinks.size > 0) {
		serialStatus.classList.add('connected');
	} else {
		serialStatus.classList.remove('connected');
	}
}

function startMonitoring() {
	setInterval(updateStatus, 100); // Update every 100ms
}

function updateStatus() {
	updateGamepadStatus();
}

// Cache of the last-seen controller state:
const prevState = {
	connected: false,
	id: null,
	buttons: [],   // array of booleans
	axes: []       // array of numbers
};

function updateGamepadStatus() {
	const gamepads = navigator.getGamepads();
	const gamepad = gamepads[0];

	// Helper for shallow array compare
	const arraysEqual = (a, b) =>
		a.length === b.length && a.every((v, i) => v === b[i]);

	if (gamepad) {
		// 1) Connection status & id
		if (!prevState.connected) {
			prevState.connected = true;
		}
		if (prevState.id !== gamepad.id) {
			gamepadName.textContent = gamepad.id;
			prevState.id = gamepad.id;
		}

		// 2) Buttons
		const buttonMap = {
			'A': 0, 'B': 1, 'X': 2, 'Y': 3,
			'L': 4, 'R': 5, 'ZL': 6, 'ZR': 7,
			'-': 8, '+': 9, 'h': 16, 'c': 17,
			'↑': 12, '↓': 13, '←': 14, '→': 15
		};
		// Build new array of pressed states in the same order as prevState.buttons
		const newButtons = Object.entries(buttonMap).map(([label, idx]) => {
			const pressed = !!(gamepad.buttons[idx] && gamepad.buttons[idx].pressed);
			const el = document.querySelector(`[data-button="${label}"]`);
			if (el) el.classList.toggle('pressed', pressed);
			return pressed;
		});
		// Only update cache if it actually changed
		if (!arraysEqual(prevState.buttons, newButtons)) {
			prevState.buttons = newButtons;
		}

		// 3) Axes
		const newAxes = [
			+(gamepad.axes[0] || 0).toFixed(2),
			+(gamepad.axes[1] || 0).toFixed(2),
			+(gamepad.axes[2] || 0).toFixed(2),
			+(gamepad.axes[3] || 0).toFixed(2)
		];
		if (!arraysEqual(prevState.axes, newAxes)) {
			leftStick.textContent = `${newAxes[0]}, ${newAxes[1]}`;
			rightStick.textContent = `${newAxes[2]}, ${newAxes[3]}`;
			prevState.axes = newAxes;
		}

	} else {
		// If previously connected, clear everything once:
		if (prevState.connected) {
			gamepadName.textContent = 'No gamepad detected';
			document.querySelectorAll('.button-indicator').forEach(btn => {
				btn.classList.remove('pressed');
			});
			leftStick.textContent = '0.00, 0.00';
			rightStick.textContent = '0.00, 0.00';
			// Reset cache
			prevState.connected = false;
			prevState.id = null;
			prevState.buttons = [];
			prevState.axes = [];
		}
	}
}

function logMessage(message) {
	const timestamp = new Date().toLocaleTimeString();
	const messageDiv = document.createElement('div');
	messageDiv.className = 'message';
	messageDiv.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;

	messageLog.appendChild(messageDiv);
	messageLog.scrollTop = messageLog.scrollHeight;

	// Keep only last 50 messages
	while (messageLog.children.length > 50) {
		messageLog.removeChild(messageLog.firstChild);
	}
}

// Configuration Panel Collapse/Expand Functionality
function initializeConfigCollapse() {
	const configHeader = document.getElementById('configHeader');
	const configToggle = document.getElementById('configToggle');
	const configContent = document.getElementById('configContent');

	// Handle click on header or toggle button
	configHeader.addEventListener('click', toggleConfigPanel);

	function toggleConfigPanel() {
		const isExpanded = configContent.classList.contains('expanded');

		if (isExpanded) {
			// Collapse
			configContent.classList.remove('expanded');
			configContent.classList.add('collapsed');
			configToggle.textContent = '▷';
			configToggle.classList.remove('expanded');
		} else {
			// Expand
			configContent.classList.remove('collapsed');
			configContent.classList.add('expanded');
			configToggle.textContent = '▷';
			configToggle.classList.add('expanded');
		}
	}
}

// Check for Web Serial support
if (!('serial' in navigator)) {
	logMessage('ERROR: Web Serial API not supported. Please use Chrome/Edge.');
} else {
	// Initialize the app
	init();
}

window.swiccDebug = {
	engine,
	pipeline,                      // Updated: Export pipeline instead of manager
	messageHandler,
	gamepadSource,
	swiccSinks,
	// Export pipeline functions for external use
	addManipulator,
	loadPipelinePreset,
	getCurrentPipelineConfig,
	loadPipelineConfig,
	executeManipulatorAction,
	PIPELINE_PRESETS
};