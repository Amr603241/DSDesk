/**
 * DSDesk PRO MAX - Multi-User Collaboration System
 * Multiple participants can join and interact in the same session
 */

class CollaborationManager {
    constructor() {
        this.sessionId = null;
        this.participants = new Map();
        this.currentUser = null;
        this.isHost = false;
    }

    // Create collaborative session
    createSession(hostDeviceId, hostName) {
        this.sessionId = this.generateSessionId();
        this.isHost = true;
        
        this.participants.set(hostDeviceId, {
            id: hostDeviceId,
            name: hostName,
            role: 'host',
            socketId: null,
            joinedAt: Date.now(),
            isOnline: true
        });

        return this.sessionId;
    }

    // Join existing session
    async joinSession(sessionId, userId, userName) {
        this.sessionId = sessionId;
        this.isHost = false;
        
        this.participants.set(userId, {
            id: userId,
            name: userName,
            role: 'participant',
            socketId: null,
            joinedAt: Date.now(),
            isOnline: true
        });

        return this.participants;
    }

    // Add participant via socket event
    addParticipant(participant) {
        this.participants.set(participant.id, {
            ...participant,
            joinedAt: Date.now(),
            isOnline: true
        });
    }

    // Remove participant
    removeParticipant(participantId) {
        this.participants.delete(participantId);
    }

    // Get all participants
    getParticipants() {
        return Array.from(this.participants.values());
    }

    // Update participant status
    updateParticipantStatus(participantId, isOnline) {
        const participant = this.participants.get(participantId);
        if (participant) {
            participant.isOnline = isOnline;
        }
    }

    // Change participant role
    setParticipantRole(participantId, role) {
        const participant = this.participants.get(participantId);
        if (participant && this.isHost) {
            participant.role = role;
        }
    }

    // Generate session ID
    generateSessionId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Sync state with server
    syncWithServer(signaling) {
        signaling.on('participant-joined', (data) => {
            this.addParticipant(data.participant);
            this.notifyParticipants('joined', data);
        });

        signaling.on('participant-left', (data) => {
            this.removeParticipant(data.participantId);
            this.notifyParticipants('left', data);
        });

        signaling.on('participant-update', (data) => {
            this.updateParticipantStatus(data.participantId, data.isOnline);
        });
    }

    onParticipantChange(callback) {
        this.callback = callback;
    }

    notifyParticipants(event, data) {
        if (this.callback) {
            this.callback(event, data);
        }
    }
}

// Visual Pointer System
class VisualPointer {
    constructor() {
        this.pointers = new Map();
        this.colors = [
            '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', 
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
        ];
        this.currentIndex = 0;
    }

    createPointer(userId, name) {
        const color = this.colors[this.currentIndex % this.colors.length];
        this.currentIndex++;

        const pointer = {
            id: userId,
            name: name,
            color: color,
            x: 0,
            y: 0,
            visible: true
        };

        this.pointers.set(userId, pointer);
        return pointer;
    }

    updatePointer(userId, x, y) {
        const pointer = this.pointers.get(userId);
        if (pointer) {
            pointer.x = x;
            pointer.y = y;
        }
    }

    removePointer(userId) {
        this.pointers.delete(userId);
    }

    getPointers() {
        return Array.from(this.pointers.values());
    }

    hidePointer(userId) {
        const pointer = this.pointers.get(userId);
        if (pointer) {
            pointer.visible = false;
        }
    }

    showPointer(userId) {
        const pointer = this.pointers.get(userId);
        if (pointer) {
            pointer.visible = true;
        }
    }
}

// Temporary Access Links System
class TemporaryAccessLink {
    constructor() {
        this.links = new Map();
    }

    // Generate temporary access link
    createLink(deviceId, options = {}) {
        const {
            expiresIn = 3600000, // 1 hour default
            maxUses = 1,
            password = null
        } = options;

        const linkId = this.generateLinkId();
        const link = {
            id: linkId,
            deviceId: deviceId,
            createdAt: Date.now(),
            expiresAt: Date.now() + expiresIn,
            maxUses: maxUses,
            uses: 0,
            password: password,
            active: true
        };

        this.links.set(linkId, link);
        
        // Auto-expire after time
        setTimeout(() => {
            this.expireLink(linkId);
        }, expiresIn);

        return {
            url: `dsdesk://connect/${linkId}`,
            expiresIn: expiresIn,
            maxUses: maxUses
        };
    }

    // Validate and use link
    useLink(linkId, password = null) {
        const link = this.links.get(linkId);
        
        if (!link) {
            return { valid: false, error: 'Link not found' };
        }

        if (!link.active) {
            return { valid: false, error: 'Link expired or used' };
        }

        if (Date.now() > link.expiresAt) {
            link.active = false;
            return { valid: false, error: 'Link expired' };
        }

        if (link.uses >= link.maxUses) {
            link.active = false;
            return { valid: false, error: 'Max uses reached' };
        }

        if (link.password && link.password !== password) {
            return { valid: false, error: 'Invalid password' };
        }

        link.uses++;
        return { 
            valid: true, 
            deviceId: link.deviceId,
            remainingUses: link.maxUses - link.uses 
        };
    }

    expireLink(linkId) {
        const link = this.links.get(linkId);
        if (link) {
            link.active = false;
        }
    }

    revokeLink(linkId) {
        this.links.delete(linkId);
    }

    generateLinkId() {
        const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// Plugin Marketplace System
class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.enabledPlugins = new Set();
    }

    // Register a plugin
    register(plugin) {
        this.plugins.set(plugin.id, {
            ...plugin,
            installedAt: Date.now(),
            enabled: false
        });
    }

    // Enable plugin
    enablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin && !this.enabledPlugins.has(pluginId)) {
            plugin.enabled = true;
            this.enabledPlugins.add(pluginId);
            
            if (plugin.onEnable) {
                plugin.onEnable();
            }
        }
    }

    // Disable plugin
    disablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin && this.enabledPlugins.has(pluginId)) {
            plugin.enabled = false;
            this.enabledPlugins.delete(pluginId);
            
            if (plugin.onDisable) {
                plugin.onDisable();
            }
        }
    }

    // Get all available plugins
    getPlugins() {
        return Array.from(this.plugins.values());
    }

    // Get enabled plugins
    getEnabledPlugins() {
        return Array.from(this.enabledPlugins);
    }

    // Default plugins marketplace
    getMarketplace() {
        return [
            {
                id: 'screen-annotate',
                name: 'Screen Annotator',
                description: 'رسم على الشاشة أثناء الجلسة',
                author: 'DSDesk',
                version: '1.0.0',
                icon: '✏️'
            },
            {
                id: 'quick-transfer',
                name: 'Quick Transfer',
                description: 'نقل سريع للملفات',
                author: 'DSDesk',
                version: '1.0.0',
                icon: '📁'
            },
            {
                id: 'voice-chat',
                name: 'Voice Chat',
                description: 'محادثة صوتية',
                author: 'DSDesk',
                version: '1.0.0',
                icon: '🎤'
            },
            {
                id: 'session-templates',
                name: 'Session Templates',
                description: 'قوالب جلسات مسبقة',
                author: 'DSDesk',
                version: '1.0.0',
                icon: '📋'
            }
        ];
    }
}

// Export modules
window.CollaborationManager = CollaborationManager;
window.VisualPointer = VisualPointer;
window.TemporaryAccessLink = TemporaryAccessLink;
window.PluginManager = PluginManager;