/**
 * DSDesk PRO MAX - Enterprise Dashboard & Analytics
 * Professional control panel for organizations
 */

class EnterpriseDashboard {
    constructor() {
        this.sessions = [];
        this.metrics = {
            totalSessions: 0,
            activeUsers: 0,
            avgLatency: 0,
            avgQuality: 0,
            uptime: 0
        };
        this.settings = {};
    }

    // Track session
    trackSession(session) {
        this.sessions.push({
            ...session,
            startTime: Date.now(),
            endTime: null,
            duration: 0
        });
        this.metrics.totalSessions++;
    }

    // End session
    endSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.endTime = Date.now();
            session.duration = session.endTime - session.startTime;
        }
    }

    // Get analytics
    getAnalytics() {
        const completedSessions = this.sessions.filter(s => s.endTime);
        
        return {
            totalSessions: this.metrics.totalSessions,
            completedSessions: completedSessions.length,
            activeUsers: this.metrics.activeUsers,
            uptime: this.calculateUptime(),
            avgDuration: this.calculateAvgDuration(completedSessions),
            avgLatency: this.metrics.avgLatency,
            avgQuality: this.metrics.avgQuality,
            peakUsage: this.getPeakUsage()
        };
    }

    calculateUptime() {
        if (this.sessions.length === 0) return 100;
        const active = this.sessions.filter(s => !s.endTime).length;
        return (active / this.sessions.length) * 100;
    }

    calculateAvgDuration(sessions) {
        if (sessions.length === 0) return 0;
        const total = sessions.reduce((sum, s) => sum + s.duration, 0);
        return total / sessions.length;
    }

    getPeakUsage() {
        // Get hour with most sessions
        const hours = {};
        this.sessions.forEach(s => {
            const hour = new Date(s.startTime).getHours();
            hours[hour] = (hours[hour] || 0) + 1;
        });
        
        const maxHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
        return maxHour ? parseInt(maxHour[0]) : 0;
    }

    // Generate report
    generateReport(type = 'daily') {
        const now = new Date();
        let startDate = new Date();

        switch (type) {
            case 'daily':
                startDate.setDate(now.getDate() - 1);
                break;
            case 'weekly':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'monthly':
                startDate.setMonth(now.getMonth() - 1);
                break;
        }

        const filteredSessions = this.sessions.filter(s => 
            s.startTime >= startDate.getTime()
        );

        return {
            type: type,
            period: { start: startDate, end: now },
            sessions: filteredSessions,
            summary: this.getAnalytics()
        };
    }

    // Export to CSV
    exportToCSV() {
        const headers = ['Session ID', 'Start Time', 'End Time', 'Duration (s)', 'Remote ID', 'Quality'];
        const rows = this.sessions.map(s => [
            s.id,
            new Date(s.startTime).toISOString(),
            s.endTime ? new Date(s.endTime).toISOString() : '',
            s.duration / 1000,
            s.remoteId || '',
            s.quality || ''
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

// Integrated Support System (Tickets + CRM)
class SupportSystem {
    constructor() {
        this.tickets = new Map();
        this.customers = new Map();
        this.settings = {
            autoAssign: true,
            priorityLevels: ['low', 'medium', 'high', 'urgent']
        };
    }

    // Create ticket
    createTicket(options = {}) {
        const ticketId = `TKT-${Date.now()}`;
        const ticket = {
            id: ticketId,
            subject: options.subject || 'No subject',
            description: options.description || '',
            priority: options.priority || 'medium',
            status: 'open',
            category: options.category || 'general',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: options.createdBy,
            assignedTo: options.assignedTo || null,
            customerId: options.customerId,
            sessionId: options.sessionId,
            messages: []
        };

        this.tickets.set(ticketId, ticket);
        return ticket;
    }

    // Update ticket
    updateTicket(ticketId, updates) {
        const ticket = this.tickets.get(ticketId);
        if (ticket) {
            Object.assign(ticket, updates);
            ticket.updatedAt = Date.now();
        }
        return ticket;
    }

    // Add message to ticket
    addMessage(ticketId, message) {
        const ticket = this.tickets.get(ticketId);
        if (ticket) {
            ticket.messages.push({
                ...message,
                timestamp: Date.now()
            });
            ticket.updatedAt = Date.now();
        }
    }

    // Close ticket
    closeTicket(ticketId) {
        this.updateTicket(ticketId, { status: 'closed', closedAt: Date.now() });
    }

    // Get tickets
    getTickets(filters = {}) {
        let result = Array.from(this.tickets.values());

        if (filters.status) {
            result = result.filter(t => t.status === filters.status);
        }
        if (filters.priority) {
            result = result.filter(t => t.priority === filters.priority);
        }
        if (filters.customerId) {
            result = result.filter(t => t.customerId === filters.customerId);
        }

        return result.sort((a, b) => b.createdAt - a.createdAt);
    }

    // CRM: Add customer
    addCustomer(customer) {
        const customerId = `CUS-${Date.now()}`;
        const newCustomer = {
            id: customerId,
            ...customer,
            createdAt: Date.now(),
            tags: [],
            tickets: []
        };

        this.customers.set(customerId, newCustomer);
        return newCustomer;
    }

    // CRM: Update customer
    updateCustomer(customerId, updates) {
        const customer = this.customers.get(customerId);
        if (customer) {
            Object.assign(customer, updates);
        }
        return customer;
    }

    // CRM: Get customer
    getCustomer(customerId) {
        return this.customers.get(customerId);
    }

    // CRM: Get all customers
    getCustomers(search = '') {
        let result = Array.from(this.customers.values());
        
        if (search) {
            const searchLower = search.toLowerCase();
            result = result.filter(c => 
                c.name?.toLowerCase().includes(searchLower) ||
                c.email?.toLowerCase().includes(searchLower)
            );
        }

        return result;
    }

    // Link ticket to customer
    linkTicketToCustomer(ticketId, customerId) {
        const ticket = this.tickets.get(ticketId);
        const customer = this.customers.get(customerId);
        
        if (ticket && customer) {
            ticket.customerId = customerId;
            customer.tickets.push(ticketId);
        }
    }

    // Get customer statistics
    getCustomerStats() {
        return {
            total: this.customers.size,
            active: Array.from(this.customers.values()).filter(c => c.status === 'active').length,
            withOpenTickets: Array.from(this.customers.values()).filter(c => 
                c.tickets.some(tid => {
                    const t = this.tickets.get(tid);
                    return t && t.status === 'open';
                })
            ).length
        };
    }
}

// Permission Control System
class PermissionControl {
    constructor() {
        this.roles = new Map();
        this.userPermissions = new Map();
        this.initDefaultRoles();
    }

    initDefaultRoles() {
        this.roles.set('admin', {
            name: 'مدير',
            permissions: ['*'],
            description: 'وصول كامل'
        });
        
        this.roles.set('technician', {
            name: 'فني',
            permissions: ['session', 'access', 'file_transfer', 'chat', 'settings'],
            description: 'فني دعم'
        });
        
        this.roles.set('viewer', {
            name: 'مشاهد',
            permissions: ['session', 'view_only'],
            description: 'مشاهدة فقط'
        });
        
        this.roles.set('user', {
            name: 'مستخدم',
            permissions: ['session', 'access'],
            description: 'وصول أساسي'
        });
    }

    // Set user role
    setUserRole(userId, roleId) {
        this.userPermissions.set(userId, {
            roleId: roleId,
            assignedAt: Date.now()
        });
    }

    // Check permission
    hasPermission(userId, permission) {
        const userPerms = this.userPermissions.get(userId);
        if (!userPerms) return false;

        const role = this.roles.get(userPerms.roleId);
        if (!role) return false;

        return role.permissions.includes('*') || role.permissions.includes(permission);
    }

    // Get user role
    getUserRole(userId) {
        const userPerms = this.userPermissions.get(userId);
        return userPerms ? userPerms.roleId : null;
    }

    // Get role permissions
    getRolePermissions(roleId) {
        const role = this.roles.get(roleId);
        return role ? role.permissions : [];
    }

    // Get all roles
    getRoles() {
        return Array.from(this.roles.entries()).map(([id, role]) => ({
            id,
            ...role
        }));
    }

    // Create custom role
    createRole(id, name, permissions, description = '') {
        this.roles.set(id, {
            name,
            permissions,
            description
        });
    }
}

// Export modules
window.EnterpriseDashboard = EnterpriseDashboard;
window.SupportSystem = SupportSystem;
window.PermissionControl = PermissionControl;