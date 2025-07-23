import { Bot, CommandGroup, Strategy } from './Bot.js';
import { GLaMSController } from '../src/utils/GLaMSController.js';

// Configuration constants
const CONFIG = {
	MAX_LOG_MESSAGES: 50,
	DEFAULT_VALUES: {
		COOLDOWN: 0,
		MIN_KEYWORDS: 1,
		MAX_KEYWORDS: 1,
		KEYWORD_WEIGHT: 1,
		STRATEGY_MIN_TIME: 10000,
		STRATEGY_COOLDOWN: 0,
		STRATEGY_WEIGHT: 1,
		MIN_GROUPS: 1,
		MAX_GROUPS: 1,
		GLOBAL_COOLDOWN: 100,
		GLOBAL_STRATEGY_MIN_TIME: 10000,
		MANIPULATOR_ID: 'ChatCommand-1'
	}
};

// Utility class for DOM manipulation
class DOMUtils {
	static createElement(tag, className = '', innerHTML = '') {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (innerHTML) element.innerHTML = innerHTML;
		return element;
	}

	static clearElement(element) {
		while (element.firstChild) {
			element.removeChild(element.firstChild);
		}
	}

	static showError(elementId, message) {
		const element = document.getElementById(elementId);
		if (element) {
			element.textContent = message;
		}
	}

	static clearError(elementId) {
		this.showError(elementId, '');
	}

	static getInputValue(id, defaultValue = '') {
		const element = document.getElementById(id);
		return element ? element.value : defaultValue;
	}

	static setInputValue(id, value) {
		const element = document.getElementById(id);
		if (element) {
			element.value = value;
		}
	}
}

// Configuration manager for save/load operations
class ConfigManager {
	constructor(bot, logger) {
		this.bot = bot;
		this.logger = logger;
		this.STORAGE_KEY = 'bot-config';
	}

	// Auto-save configuration (silent)
	autoSave() {
		try {
			const config = this.bot.exportConfig();
			config.timestamp = Date.now();
			config.version = '1.0';

			// Store in localStorage
			localStorage.setItem('botConfig', JSON.stringify(config));
		} catch (error) {
			// Silent failure for auto-save
			console.warn('Auto-save failed:', error.message);
		}
	}

	load() {
		try {
			let config = null;

			// Load from localStorage
			const savedData = localStorage.getItem('botConfig');
			if (savedData) {
				config = JSON.parse(savedData);
				this.logger.log('Configuration loaded from localStorage');
			}

			if (config) {
				this.bot.importConfig(config);
				return true;
			}

			// Create default configuration if nothing found
			const defaultConfig = {
				commandGroups: [],
				strategies: [],
				currentStrategyName: 'None',
				globalSettings: {
					globalCooldown: CONFIG.DEFAULT_VALUES.GLOBAL_COOLDOWN,
					globalStrategyMinTime: CONFIG.DEFAULT_VALUES.GLOBAL_STRATEGY_MIN_TIME,
					manipulatorId: CONFIG.DEFAULT_VALUES.MANIPULATOR_ID
				}
			};

			this.bot.importConfig(defaultConfig);
			this.logger.log('Loaded default configuration');
			return true;
		} catch (error) {
			this.logger.log(`Error loading configuration: ${error.message}`, 'error');
			return false;
		}
	}

	// Optional: Method to clear stored configuration
	clearStorage() {
		try {
			localStorage.removeItem('botConfig');
			this.logger.log('Configuration cleared from localStorage');
		} catch (error) {
			this.logger.log(`Error clearing configuration: ${error.message}`, 'error');
		}
	}

	export() {
		try {
			const config = this.bot.exportConfig();
			config.timestamp = Date.now();
			config.version = '1.0';

			const data = JSON.stringify(config, null, 2);
			const blob = new Blob([data], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			const a = document.createElement('a');
			a.href = url;
			a.download = `bot-config-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			this.logger.log('Configuration exported to file');
		} catch (error) {
			this.logger.log(`Error exporting configuration: ${error.message}`, 'error');
		}
	}

	import(file) {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const config = JSON.parse(e.target.result);
					this.bot.importConfig(config);
					this.autoSave(); // Auto-save after import
					this.logger.log(`Configuration imported from ${file.name}`);
					resolve(true);
				} catch (error) {
					this.logger.log(`Error importing configuration: ${error.message}`, 'error');
					resolve(false);
				}
			};
			reader.readAsText(file);
		});
	}

	reset() {
		this.bot = new Bot();
		this.savedConfig = null;
		this.autoSave(); // Auto-save after reset
		this.logger.log('Configuration reset');
		return this.bot;
	}
}

// Logger for system messages
class Logger {
	constructor(logElementId) {
		this.logElement = document.getElementById(logElementId);
	}

	log(message, type = 'info') {
		if (!this.logElement) return;

		const div = DOMUtils.createElement('div', `message ${type}`);
		div.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
		this.logElement.appendChild(div);
		this.logElement.scrollTop = this.logElement.scrollHeight;

		// Keep only last N messages
		while (this.logElement.children.length > CONFIG.MAX_LOG_MESSAGES) {
			this.logElement.removeChild(this.logElement.firstChild);
		}
	}
}

// GLaMS Connection Manager
class GLaMSManager {
	constructor(logger) {
		this.logger = logger;
		this.controller = null;
		this.isConnected = false;
		this.currentRoom = '';
		this.connectionMethod = 'browser';
	}

	async connect(roomName, method = 'browser') {
		if (this.isConnected) {
			this.disconnect();
		}

		try {
			this.controller = new GLaMSController({
				onMessage: (message) => this.handleMessage(message),
				onConnect: (info) => this.handleConnect(info),
				onDisconnect: (reason) => this.handleDisconnect(reason),
				onError: (error) => this.handleError(error)
			});

			await this.controller.connect(roomName, method);
			this.isConnected = true;
			this.currentRoom = roomName;
			this.connectionMethod = method;
			return true;
		} catch (error) {
			this.logger.log(`Connection failed: ${error.message}`, 'error');
			return false;
		}
	}

	disconnect() {
		if (this.controller) {
			this.controller.disconnect();
			this.controller = null;
		}
		this.isConnected = false;
		this.currentRoom = '';
	}

	sendMessage(messageText, manipulatorId = 'ChatCommand-1') {
		if (!this.isConnected || !this.controller) {
			throw new Error('Not connected to GLaMS');
		}

		const message = {
			type: 'executeAction',
			manipulatorId: manipulatorId,
			actionName: 'insertMessage',
			params: JSON.stringify({ message: messageText })
		};

		this.controller.sendMessage(message);
		this.logger.log(`Sent message: "${messageText}"`);
	}

	handleMessage(message) {
		this.logger.log(`GLaMS message: ${JSON.stringify(message)}`);
	}

	handleConnect(info) {
		this.logger.log(`GLaMS connected: ${info}`);
	}

	handleDisconnect(reason) {
		this.isConnected = false;
		this.logger.log(`GLaMS disconnected: ${reason}`);
	}

	handleError(error) {
		this.logger.log(`GLaMS error: ${error}`, 'error');
	}

	getConnectionInfo() {
		return {
			isConnected: this.isConnected,
			currentRoom: this.currentRoom,
			connectionMethod: this.connectionMethod
		};
	}
}

// Bot Runner - handles automated message generation
class BotRunner {
	constructor(bot, glamsManager, logger) {
		this.bot = bot;
		this.glamsManager = glamsManager;
		this.logger = logger;
		this.isRunning = false;
		this.manipulatorId = CONFIG.DEFAULT_VALUES.MANIPULATOR_ID;
		this.strategyBox = null;
		this.messageBox = null;
	}

	start() {
		if (this.isRunning) return;

		if (!this.glamsManager.isConnected) {
			throw new Error('GLaMS not connected');
		}

		this.isRunning = true;
		// Start the message generation
		this.generateAndSendMessage();

		this.logger.log(`Bot started.`);
	}

	stop() {
		if (!this.isRunning) return;

		this.isRunning = false;

		this.logger.log('Bot stopped');
	}

	generateAndSendMessage() {
		if (this.isRunning) {
			try {
				const message = this.bot.generateMessage();
				if (message && message.text) {
					this.glamsManager.sendMessage(message.text, this.manipulatorId);
					if (this.strategyBox) this.strategyBox.innerHTML = this.bot.currentStrategy.name;
					if (this.messageBox) this.messageBox.innerHTML = this.bot.lastMessage;
				}
			} catch (error) {
				this.logger.log(`Error generating message: ${error.message}`, 'error');
				this.stop();
			}
			requestAnimationFrame(() => this.generateAndSendMessage());
		}
	}

	setManipulatorId(id) {
		this.manipulatorId = id || CONFIG.DEFAULT_VALUES.MANIPULATOR_ID;
	}

	setFeedbackBoxes(strategyBox, messageBox) {
		this.strategyBox = strategyBox;
		this.messageBox = messageBox;
	}
}

// Validator for form inputs
class Validator {
	static validateGroup(minKeywords, maxKeywords) {
		if (minKeywords > maxKeywords) {
			return 'Min keywords cannot be greater than max keywords';
		}
		return null;
	}

	static validateStrategy(minGroups, maxGroups) {
		if (minGroups > maxGroups) {
			return 'Min groups cannot be greater than max groups';
		}
		return null;
	}

	static validateRequired(value, fieldName) {
		if (!value || !value.trim()) {
			return `${fieldName} is required`;
		}
		return null;
	}
}

// Base class for form managers
class BaseFormManager {
	constructor(bot, logger) {
		this.bot = bot;
		this.logger = logger;
		this.selected = null;
		this.isEditing = false;
	}

	select(name) {
		this.selected = name;
	}

	clearSelected() {
		this.selected = null;
	}

	hasSelected() {
		return this.selected !== null;
	}
}

// Command Group form manager
class CommandGroupManager extends BaseFormManager {
	constructor(bot, logger) {
		super(bot, logger);
		this.tempKeywords = new Map(); // Store keywords for new groups
	}

	showListView() {
		document.getElementById('commandGroupsListView').style.display = 'block';
		document.getElementById('commandGroupsEditView').style.display = 'none';
		this.isEditing = false;
		this.clearSelected();
		this.tempKeywords.clear(); // Clear temp keywords when returning to list
	}

	showEditView(isNew = false) {
		document.getElementById('commandGroupsListView').style.display = 'none';
		document.getElementById('commandGroupsEditView').style.display = 'block';
		this.isEditing = true;

		const title = document.getElementById('commandGroupEditTitle');
		if (title) {
			title.textContent = isNew ? 'Add New Command Group' : 'Edit Command Group';
		}
	}

	updateList() {
		const container = document.getElementById('commandGroupsList');
		DOMUtils.clearElement(container);

		this.bot.commandGroups.forEach((group, name) => {
			const div = DOMUtils.createElement('div', 'item-entry');

			div.innerHTML = `
				<div class="item-info">
					<div class="item-name">${name}</div>
					<div class="item-details">
						Keywords: ${group.keywords.length} | 
						Cooldown: ${group.cooldown}ms | 
						Keywords per message: ${group.minKeywords}-${group.maxKeywords}
					</div>
				</div>
			`;

			div.addEventListener('click', () => {
				this.editGroup(name);
			});
			container.appendChild(div);
		});
	}

	editGroup(name) {
		this.select(name);
		this.showEditView(false);
		this.updateForm();
	}

	updateForm() {
		if (!this.selected || !this.bot.commandGroups.has(this.selected)) {
			this.clearForm();
			return;
		}

		const group = this.bot.commandGroups.get(this.selected);
		DOMUtils.setInputValue('groupName', group.name);
		DOMUtils.setInputValue('groupCooldown', group.cooldown);
		DOMUtils.setInputValue('groupMinKeywords', group.minKeywords);
		DOMUtils.setInputValue('groupMaxKeywords', group.maxKeywords);

		this.updateKeywordContainer(group);
	}

	updateKeywordContainer(group = null) {
		const container = document.getElementById('keywordContainer');
		DOMUtils.clearElement(container);

		// If we have a group, show its keywords
		if (group) {
			group.keywords.forEach(keyword => {
				const tag = this.createKeywordTag(keyword, group.getKeywordWeight(keyword));
				container.appendChild(tag);
			});
		} else {
			// Show temporary keywords for new groups
			this.tempKeywords.forEach((weight, keyword) => {
				const tag = this.createKeywordTag(keyword, weight);
				container.appendChild(tag);
			});
		}
	}

	createKeywordTag(keyword, weight) {
		const tag = DOMUtils.createElement('div', 'keyword-tag');

		tag.innerHTML = `
			${keyword}
			<span class="keyword-weight">${weight}</span>
			<button class="keyword-remove" data-keyword="${keyword}">×</button>
		`;

		tag.querySelector('.keyword-remove').addEventListener('click', (e) => {
			e.stopPropagation();
			this.removeKeyword(keyword);
		});

		return tag;
	}

	addNew() {
		this.clearSelected();
		this.tempKeywords.clear();
		this.showEditView(true);
		this.clearForm();
		this.updateKeywordContainer(); // Show empty container for temp keywords
		this.logger.log('Creating new command group');
	}

	save() {
		const name = DOMUtils.getInputValue('groupName').trim();
		const error = Validator.validateRequired(name, 'Group name');
		if (error) {
			DOMUtils.showError('groupValidationError', error);
			return false;
		}

		const minKeywords = parseInt(DOMUtils.getInputValue('groupMinKeywords')) || CONFIG.DEFAULT_VALUES.MIN_KEYWORDS;
		const maxKeywords = parseInt(DOMUtils.getInputValue('groupMaxKeywords')) || CONFIG.DEFAULT_VALUES.MAX_KEYWORDS;

		const validationError = Validator.validateGroup(minKeywords, maxKeywords);
		if (validationError) {
			DOMUtils.showError('groupValidationError', validationError);
			return false;
		}

		const config = {
			cooldown: parseInt(DOMUtils.getInputValue('groupCooldown')) || CONFIG.DEFAULT_VALUES.COOLDOWN,
			minKeywords,
			maxKeywords,
		};

		// Handle rename or preserve existing data
		if (this.selected) {
			const oldGroup = this.bot.commandGroups.get(this.selected);
			if (oldGroup) {
				config.keywords = oldGroup.keywords;
				config.keywordWeights = Object.fromEntries(oldGroup.keywordWeights);
			}
			if (this.selected !== name) {
				this.bot.removeCommandGroup(this.selected);
			}
		} else {
			// For new groups, use temporary keywords
			config.keywords = Array.from(this.tempKeywords.keys());
			config.keywordWeights = Object.fromEntries(this.tempKeywords);
		}

		this.bot.addCommandGroup(name, config);
		this.logger.log(`Saved command group: ${name}`);
		DOMUtils.clearError('groupValidationError');

		// Auto-save and clear temp keywords and return to list view
		this.bot.configManager.autoSave();
		this.tempKeywords.clear();
		this.showListView();
		this.updateList();
		return true;
	}

	delete() {
		if (!this.selected) return false;

		if (confirm(`Delete command group "${this.selected}"?`)) {
			this.bot.removeCommandGroup(this.selected);
			this.logger.log(`Deleted command group`);

			// Auto-save and return to list view
			this.bot.configManager.autoSave();
			this.showListView();
			this.updateList();
			return true;
		}
		return false;
	}

	addKeyword() {
		const keyword = DOMUtils.getInputValue('keywordInput').trim();
		const weight = parseFloat(DOMUtils.getInputValue('keywordWeight')) || CONFIG.DEFAULT_VALUES.KEYWORD_WEIGHT;

		if (!keyword) return;

		// If we're editing an existing group
		if (this.selected) {
			const group = this.bot.commandGroups.get(this.selected);
			group.addKeyword(keyword, weight);
			this.updateKeywordContainer(group);
			// Auto-save after adding keyword to existing group
			this.bot.configManager.autoSave();
		} else {
			// For new groups, store in temp keywords (no auto-save until group is saved)
			this.tempKeywords.set(keyword, weight);
			this.updateKeywordContainer();
		}

		DOMUtils.setInputValue('keywordInput', '');
		DOMUtils.setInputValue('keywordWeight', CONFIG.DEFAULT_VALUES.KEYWORD_WEIGHT);
		this.logger.log(`Added keyword: ${keyword} (weight: ${weight})`);
	}

	removeKeyword(keyword) {
		if (this.selected) {
			// Remove from existing group
			const group = this.bot.commandGroups.get(this.selected);
			group.removeKeyword(keyword);
			this.updateKeywordContainer(group);
			// Auto-save after removing keyword from existing group
			this.bot.configManager.autoSave();
		} else {
			// Remove from temp keywords (no auto-save until group is saved)
			this.tempKeywords.delete(keyword);
			this.updateKeywordContainer();
		}
		this.logger.log(`Removed keyword: ${keyword}`);
	}

	clearForm() {
		DOMUtils.setInputValue('groupName', '');
		DOMUtils.setInputValue('groupCooldown', CONFIG.DEFAULT_VALUES.COOLDOWN);
		DOMUtils.setInputValue('groupMinKeywords', CONFIG.DEFAULT_VALUES.MIN_KEYWORDS);
		DOMUtils.setInputValue('groupMaxKeywords', CONFIG.DEFAULT_VALUES.MAX_KEYWORDS);
		DOMUtils.setInputValue('keywordInput', '');
		DOMUtils.setInputValue('keywordWeight', CONFIG.DEFAULT_VALUES.KEYWORD_WEIGHT);
		DOMUtils.clearElement(document.getElementById('keywordContainer'));
		DOMUtils.clearError('groupValidationError');
	}
}

// Strategy form manager
class StrategyManager extends BaseFormManager {
	showListView() {
		document.getElementById('strategiesListView').style.display = 'block';
		document.getElementById('strategiesEditView').style.display = 'none';
		this.isEditing = false;
		this.clearSelected();
	}

	showEditView(isNew = false) {
		document.getElementById('strategiesListView').style.display = 'none';
		document.getElementById('strategiesEditView').style.display = 'block';
		this.isEditing = true;

		const title = document.getElementById('strategyEditTitle');
		if (title) {
			title.textContent = isNew ? 'Add New Strategy' : 'Edit Strategy';
		}
	}

	updateList() {
		const container = document.getElementById('strategiesList');
		DOMUtils.clearElement(container);

		this.bot.strategies.forEach((strategy, name) => {
			const div = DOMUtils.createElement('div', 'item-entry');

			div.innerHTML = `
				<div class="item-info">
					<div class="item-name">${name}</div>
					<div class="item-details">
						Groups per message: ${strategy.minGroups}-${strategy.maxGroups} | 
						Weight: ${strategy.switchWeight} | 
						Min Time: ${strategy.minTime}ms
					</div>
				</div>
			`;

			div.addEventListener('click', () => {
				this.editStrategy(name);
			});
			container.appendChild(div);
		});
	}

	editStrategy(name) {
		this.select(name);
		this.showEditView(false);
		this.updateForm();
	}

	updateForm() {
		if (!this.selected || !this.bot.strategies.has(this.selected)) {
			this.clearForm();
			return;
		}

		const strategy = this.bot.strategies.get(this.selected);
		DOMUtils.setInputValue('strategyName', strategy.name);
		DOMUtils.setInputValue('strategyMinTime', strategy.minTime);
		DOMUtils.setInputValue('strategyCooldown', strategy.cooldown);
		DOMUtils.setInputValue('strategySwitchWeight', strategy.switchWeight);
		DOMUtils.setInputValue('strategyMinGroups', strategy.minGroups);
		DOMUtils.setInputValue('strategyMaxGroups', strategy.maxGroups);

		this.updateGroupWeightContainer(strategy);
	}

	updateGroupWeightContainer(strategy) {
		const container = document.getElementById('groupWeightContainer');
		DOMUtils.clearElement(container);

		this.bot.commandGroups.forEach((group, name) => {
			const div = DOMUtils.createElement('div', 'weight-mapping');
			const weight = strategy ? strategy.getGroupWeight(name) : 0;

			div.innerHTML = `
				<span>${name}</span>
				<input type="number" class="weight-input" min="0" step="0.1" value="${weight}" data-group="${name}">
				<button class="button secondary" type="button" data-action="unity">Unity</button>
				<button class="button secondary" type="button" data-action="disable">Disable</button>
			`;

			const input = div.querySelector('input');
			const unityBtn = div.querySelector('button[data-action="unity"]');
			const disableBtn = div.querySelector('button[data-action="disable"]');

			input.addEventListener('change', (e) => {
				if (strategy) {
					strategy.setGroupWeight(name, parseFloat(e.target.value) || 0);
				}
			});

			unityBtn.addEventListener('click', () => {
				input.value = '1';
				if (strategy) {
					strategy.setGroupWeight(name, 1);
				}
			});

			disableBtn.addEventListener('click', () => {
				input.value = '0';
				if (strategy) {
					strategy.setGroupWeight(name, 0);
				}
			});

			container.appendChild(div);
		});
	}

	addNew() {
		this.clearSelected();
		this.showEditView(true);
		this.clearForm();
		// Update group weights for new strategy
		this.updateGroupWeightContainer(null);
		this.logger.log('Creating new strategy');
	}

	save() {
		const name = DOMUtils.getInputValue('strategyName').trim();
		const error = Validator.validateRequired(name, 'Strategy name');
		if (error) {
			DOMUtils.showError('strategyValidationError', error);
			return false;
		}

		const minGroups = parseInt(DOMUtils.getInputValue('strategyMinGroups')) || CONFIG.DEFAULT_VALUES.MIN_GROUPS;
		const maxGroups = parseInt(DOMUtils.getInputValue('strategyMaxGroups')) || CONFIG.DEFAULT_VALUES.MAX_GROUPS;

		const validationError = Validator.validateStrategy(minGroups, maxGroups);
		if (validationError) {
			DOMUtils.showError('strategyValidationError', validationError);
			return false;
		}

		const config = {
			minTime: parseInt(DOMUtils.getInputValue('strategyMinTime')) || CONFIG.DEFAULT_VALUES.STRATEGY_MIN_TIME,
			cooldown: parseInt(DOMUtils.getInputValue('strategyCooldown')) || CONFIG.DEFAULT_VALUES.STRATEGY_COOLDOWN,
			switchWeight: parseFloat(DOMUtils.getInputValue('strategySwitchWeight')) || CONFIG.DEFAULT_VALUES.STRATEGY_WEIGHT,
			minGroups,
			maxGroups,
		};

		// Collect group weights from the form
		const groupWeights = {};
		document.querySelectorAll('#groupWeightContainer input[data-group]').forEach(input => {
			const groupName = input.dataset.group;
			const weight = parseFloat(input.value) || 0;
			groupWeights[groupName] = weight;
		});
		config.groups = groupWeights;

		// Handle rename or preserve existing data
		if (this.selected && this.selected !== name) {
			this.bot.removeStrategy(this.selected);
		}

		this.bot.addStrategy(name, config);
		this.logger.log(`Saved strategy: ${name}`);
		DOMUtils.clearError('strategyValidationError');

		// Auto-save and return to list view
		this.bot.configManager.autoSave();
		this.showListView();
		this.updateList();
		return true;
	}

	delete() {
		if (!this.selected) return false;

		if (confirm(`Delete strategy "${this.selected}"?`)) {
			this.bot.removeStrategy(this.selected);
			this.logger.log(`Deleted strategy`);

			// Auto-save and return to list view
			this.bot.configManager.autoSave();
			this.showListView();
			this.updateList();
			return true;
		}
		return false;
	}

	clearForm() {
		DOMUtils.setInputValue('strategyName', '');
		DOMUtils.setInputValue('strategyMinTime', CONFIG.DEFAULT_VALUES.STRATEGY_MIN_TIME);
		DOMUtils.setInputValue('strategyCooldown', CONFIG.DEFAULT_VALUES.STRATEGY_COOLDOWN);
		DOMUtils.setInputValue('strategySwitchWeight', CONFIG.DEFAULT_VALUES.STRATEGY_WEIGHT);
		DOMUtils.setInputValue('strategyMinGroups', CONFIG.DEFAULT_VALUES.MIN_GROUPS);
		DOMUtils.setInputValue('strategyMaxGroups', CONFIG.DEFAULT_VALUES.MAX_GROUPS);
		DOMUtils.clearElement(document.getElementById('groupWeightContainer'));
		DOMUtils.clearError('strategyValidationError');
	}
}

// Tab manager for handling tab switching
class TabManager {
	constructor(commandGroupManager, strategyManager) {
		this.commandGroupManager = commandGroupManager;
		this.strategyManager = strategyManager;
		this.setupEventListeners();
	}

	setupEventListeners() {
		document.querySelectorAll('.config-tab').forEach(tab => {
			tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
		});
	}

	switchTab(tabName) {
		// Update tab buttons
		document.querySelectorAll('.config-tab').forEach(tab => {
			tab.classList.toggle('active', tab.dataset.tab === tabName);
		});

		// Update tab content
		document.querySelectorAll('.tab-content').forEach(content => {
			content.classList.toggle('active', content.id === tabName);
		});

		// Reset to list view when switching tabs and update displays
		if (tabName === 'commandGroups') {
			this.commandGroupManager.showListView();
			this.commandGroupManager.updateList();
		} else if (tabName === 'strategies') {
			this.strategyManager.showListView();
			this.strategyManager.updateList();
		}
	}
}

// Main interface class
class BotConfigInterface {
	constructor() {
		this.bot = new Bot();
		this.logger = new Logger('messageLog');
		this.configManager = new ConfigManager(this.bot, this.logger);
		this.glamsManager = new GLaMSManager(this.logger);
		this.botRunner = new BotRunner(this.bot, this.glamsManager, this.logger);
		this.commandGroupManager = new CommandGroupManager(this.bot, this.logger);
		this.strategyManager = new StrategyManager(this.bot, this.logger);
		this.tabManager = new TabManager(this.commandGroupManager, this.strategyManager);

		// Make configManager available to managers for auto-save
		this.bot.configManager = this.configManager;

		this.init();
	}

	init() {
		this.setupEventListeners();
		this.configManager.load();
		this.updateDisplay();
		this.updateConnectionUI();
		this.updateBotControlsUI();
	}

	setupEventListeners() {
		// Configuration management
		this.bindEvent('exportConfigBtn', 'click', () => this.configManager.export());
		this.bindEvent('importConfigBtn', 'click', () => this.handleImportConfig());
		this.bindEvent('resetConfigBtn', 'click', () => this.handleResetConfig());
		this.bindEvent('importFileInput', 'change', (e) => this.handleFileImport(e));

		// GLaMS Connection
		this.bindEvent('connectBtn', 'click', () => this.handleConnect());
		this.bindEvent('disconnectBtn', 'click', () => this.handleDisconnect());

		// Bot Controls
		this.bindEvent('startBotBtn', 'click', () => this.handleStartBot());
		this.bindEvent('stopBotBtn', 'click', () => this.handleStopBot());

		// Command Groups
		this.bindEvent('addCommandGroupBtn', 'click', () => this.commandGroupManager.addNew());
		this.bindEvent('backToGroupsListBtn', 'click', () => this.handleBackToGroupsList());
		this.bindEvent('saveGroupBtn', 'click', () => this.commandGroupManager.save());
		this.bindEvent('deleteGroupBtn', 'click', () => this.commandGroupManager.delete());
		this.bindEvent('addKeywordBtn', 'click', () => this.commandGroupManager.addKeyword());

		// Strategies
		this.bindEvent('addStrategyBtn', 'click', () => this.strategyManager.addNew());
		this.bindEvent('backToStrategiesListBtn', 'click', () => this.handleBackToStrategiesList());
		this.bindEvent('saveStrategyBtn', 'click', () => this.strategyManager.save());
		this.bindEvent('deleteStrategyBtn', 'click', () => this.strategyManager.delete());

		// Global Settings
		this.bindEvent('saveGlobalSettingsBtn', 'click', () => this.handleSaveGlobalSettings());

		// Input validation
		this.bindEvent('groupMinKeywords', 'change', () => this.validateGroupInputs());
		this.bindEvent('groupMaxKeywords', 'change', () => this.validateGroupInputs());
		this.bindEvent('strategyMinGroups', 'change', () => this.validateStrategyInputs());
		this.bindEvent('strategyMaxGroups', 'change', () => this.validateStrategyInputs());
	}

	bindEvent(elementId, event, handler) {
		const element = document.getElementById(elementId);
		if (element) {
			element.addEventListener(event, handler);
		}
	}

	updateDisplay() {
		this.updateBotStatus();
		this.commandGroupManager.updateList();
		this.strategyManager.updateList();
		this.updateGlobalSettingsForm();
	}

	updateBotStatus() {
		const status = this.bot.getStatus();
		const statusContainer = document.getElementById('botStatus');

		statusContainer.innerHTML = `
			<div class="status-card" id="bot-strategy-box">
				<div class="status-title">Current Strategy</div>
				<div class="status-value">${status.currentStrategy}</div>
			</div>
			<div class="status-card" id="bot-last-message">
				<div class="status-title">Last Message</div>
				<div class="status-value">${this.bot.lastMessage}</div>
			</div>
		`;

		const strategyBox = statusContainer.querySelector('#bot-strategy-box .status-value');
		const messageBox = statusContainer.querySelector('#bot-last-message  .status-value');
		this.botRunner.setFeedbackBoxes(strategyBox, messageBox);

	}

	updateGlobalSettingsForm() {
		DOMUtils.setInputValue('globalCooldown', this.bot.globalCooldown);
		DOMUtils.setInputValue('globalStrategyMinTime', this.bot.globalStrategyMinTime);
		DOMUtils.setInputValue('manipulatorId', this.botRunner.manipulatorId);
	}

	updateConnectionUI() {
		const info = this.glamsManager.getConnectionInfo();
		const indicator = document.getElementById('connectionIndicator');
		const status = document.getElementById('connectionStatus');
		const connectBtn = document.getElementById('connectBtn');
		const disconnectBtn = document.getElementById('disconnectBtn');

		if (info.isConnected) {
			indicator.classList.add('connected');
			status.textContent = `Connected to ${info.currentRoom} (${info.connectionMethod})`;
			connectBtn.disabled = true;
			disconnectBtn.disabled = false;
		} else {
			indicator.classList.remove('connected');
			status.textContent = 'Disconnected';
			connectBtn.disabled = false;
			disconnectBtn.disabled = true;
		}
	}

	updateBotControlsUI() {
		const isConnected = this.glamsManager.isConnected;
		const isRunning = this.botRunner.isRunning;
		const startBtn = document.getElementById('startBotBtn');
		const stopBtn = document.getElementById('stopBotBtn');
		const statusSpan = document.getElementById('botRunningStatus');

		startBtn.disabled = !isConnected || isRunning;
		stopBtn.disabled = !isRunning;

		if (isRunning) {
			statusSpan.textContent = 'Bot Running';
			statusSpan.className = 'bot-running';
		} else {
			statusSpan.textContent = 'Bot Stopped';
			statusSpan.className = 'bot-stopped';
		}
	}

	// Event handlers
	async handleConnect() {
		const roomName = DOMUtils.getInputValue('roomName').trim();
		const method = DOMUtils.getInputValue('connectionMethod');

		if (!roomName) {
			this.logger.log('Room name is required', 'error');
			return;
		}

		const success = await this.glamsManager.connect(roomName, method);
		this.updateConnectionUI();
		this.updateBotControlsUI();
	}

	handleDisconnect() {
		if (this.botRunner.isRunning) {
			this.botRunner.stop();
		}
		this.glamsManager.disconnect();
		this.updateConnectionUI();
		this.updateBotControlsUI();
	}

	handleStartBot() {
		try {
			this.botRunner.start();
			this.updateBotControlsUI();
		} catch (error) {
			this.logger.log(`Failed to start bot: ${error.message}`, 'error');
		}
	}

	handleStopBot() {
		this.botRunner.stop();
		this.updateBotControlsUI();
	}

	handleImportConfig() {
		document.getElementById('importFileInput').click();
	}

	async handleFileImport(event) {
		const file = event.target.files[0];
		if (!file) return;

		const success = await this.configManager.import(file);
		if (success) {
			this.commandGroupManager.showListView();
			this.strategyManager.showListView();
			this.updateDisplay();
		}

		// Clear the input so the same file can be imported again
		event.target.value = '';
	}

	handleResetConfig() {
		if (confirm('Reset all configuration? This will remove all command groups and strategies.')) {
			// Stop bot if running
			if (this.botRunner.isRunning) {
				this.botRunner.stop();
			}

			this.bot = this.configManager.reset();
			this.commandGroupManager.bot = this.bot;
			this.strategyManager.bot = this.bot;
			this.botRunner.bot = this.bot;
			// Update configManager reference for auto-save
			this.bot.configManager = this.configManager;
			this.commandGroupManager.showListView();
			this.strategyManager.showListView();
			this.updateDisplay();
			this.updateBotControlsUI();
		}
	}

	handleBackToGroupsList() {
		this.commandGroupManager.showListView();
		this.updateBotStatus();
	}

	handleBackToStrategiesList() {
		this.strategyManager.showListView();
		this.updateBotStatus();
	}

	handleSaveGlobalSettings() {
		this.bot.globalCooldown = parseInt(DOMUtils.getInputValue('globalCooldown')) || CONFIG.DEFAULT_VALUES.GLOBAL_COOLDOWN;
		this.bot.globalStrategyMinTime = parseInt(DOMUtils.getInputValue('globalStrategyMinTime')) || CONFIG.DEFAULT_VALUES.GLOBAL_STRATEGY_MIN_TIME;

		// Update bot runner settings
		const manipulatorId = DOMUtils.getInputValue('manipulatorId').trim() || CONFIG.DEFAULT_VALUES.MANIPULATOR_ID;

		this.botRunner.setManipulatorId(manipulatorId);

		this.configManager.autoSave(); // Auto-save global settings
		this.updateDisplay();
		this.logger.log('Saved global settings');
	}

	validateGroupInputs() {
		const min = parseInt(DOMUtils.getInputValue('groupMinKeywords'));
		const max = parseInt(DOMUtils.getInputValue('groupMaxKeywords'));
		const error = Validator.validateGroup(min, max);

		if (error) {
			DOMUtils.showError('groupValidationError', error);
			return false;
		}

		DOMUtils.clearError('groupValidationError');
		return true;
	}

	validateStrategyInputs() {
		const min = parseInt(DOMUtils.getInputValue('strategyMinGroups'));
		const max = parseInt(DOMUtils.getInputValue('strategyMaxGroups'));
		const error = Validator.validateStrategy(min, max);

		if (error) {
			DOMUtils.showError('strategyValidationError', error);
			return false;
		}

		DOMUtils.clearError('strategyValidationError');
		return true;
	}
}

// Initialize the interface when the page loads
document.addEventListener('DOMContentLoaded', () => {
	new BotConfigInterface();
});