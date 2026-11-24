/**
 * Main Application Logic for Team To Do List
 */

(function () {
  'use strict';

  // Access API Layer safely
  const TodoApiModule = window.TodoApi || {};
  const api = TodoApiModule.api;
  const INITIAL_MEMBERS = TodoApiModule.INITIAL_MEMBERS || [];
  const safeStorage = TodoApiModule.safeStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };

  // Application State
  const state = {
    members: [],
    tasks: [],
    currentUser: null,
    viewTargetAssignee: 'all', // 'all' or member's name
    viewMode: 'kanban', // 'kanban' or 'table'
    searchQuery: '',
    priorityFilter: 'all',
    editingTaskId: null,
    modalAttachments: [], // [{ name, type, sizeStr, previewUrl, file, url, directViewUrl, isNew }]
    selectedFile: null,
    isUploading: false
  };

  // =========================================================================
  // Initialization
  // =========================================================================

  function initApp() {
    setupEventListeners();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  async function loadData() {
    updateSyncBadge();

    try {
      const data = await api.fetchInitialData();
      state.members = data.members && data.members.length ? data.members : INITIAL_MEMBERS;
      state.tasks = data.tasks || [];

      // Initialize Current User (Default to Manager if not set)
      const savedUserId = safeStorage.getItem('team_todo_current_user_id');
      const matchedUser = state.members.find(m => m.id === savedUserId);
      state.currentUser = matchedUser || state.members.find(m => m.role === 'manager') || state.members[0];

      // Default view target: if manager, 'all'; if member, their own name
      if (state.currentUser.role === 'manager') {
        state.viewTargetAssignee = 'all';
      } else {
        state.viewTargetAssignee = state.currentUser.name;
      }

      renderAll();
    } catch (err) {
      console.error('Failed to load initial data:', err);
      state.members = INITIAL_MEMBERS;
      state.currentUser = state.members[0];
      renderAll();
    }
  }

  // =========================================================================
  // Render Functions
  // =========================================================================

  function renderAll() {
    renderUserSelector();
    renderControls();
    renderDashboard();
    renderReadOnlyNotice();

    const kanbanSec = document.getElementById('kanban-view');
    const tableSec = document.getElementById('table-view');

    if (state.viewMode === 'kanban') {
      renderKanbanBoard();
      if (kanbanSec) kanbanSec.style.display = 'block';
      if (tableSec) tableSec.style.display = 'none';
    } else {
      renderTableView();
      if (kanbanSec) kanbanSec.style.display = 'none';
      if (tableSec) tableSec.style.display = 'block';
    }
  }

  function renderUserSelector() {
    const current = state.currentUser;
    if (!current) return;

    const avatarEl = document.getElementById('current-user-avatar');
    const nameEl = document.getElementById('current-user-name');
    const roleBadgeEl = document.getElementById('current-user-role-badge');

    if (avatarEl) {
      avatarEl.textContent = getInitials(current.name);
      avatarEl.style.backgroundColor = current.avatarColor || '#2563EB';
    }
    if (nameEl) nameEl.textContent = current.name;

    if (roleBadgeEl) {
      if (current.role === 'manager') {
        roleBadgeEl.textContent = '👑 หัวหน้างาน';
        roleBadgeEl.className = 'px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700';
      } else {
        roleBadgeEl.textContent = '👤 ทีมงาน';
        roleBadgeEl.className = 'px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700';
      }
    }

    const listEl = document.getElementById('user-options-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.members.forEach(member => {
      const isSelected = member.id === current.id;
      const isMgr = member.role === 'manager';

      const item = document.createElement('div');
      item.className = `flex items-center justify-between p-2.5 hover:bg-slate-50 cursor-pointer transition ${
        isSelected ? 'bg-blue-50/70 font-semibold' : ''
      }`;

      item.innerHTML = `
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg text-white font-bold flex items-center justify-center text-[10px] shadow-xs" 
               style="background-color: ${member.avatarColor || '#3B82F6'}">
            ${getInitials(member.name)}
          </div>
          <div>
            <p class="text-xs text-slate-800 leading-tight">${member.name}</p>
            <span class="text-[10px] text-slate-400 font-normal">${isMgr ? '👑 หัวหน้างาน (เห็นภาพรวม/จัดการทั้งหมด)' : '👤 สมาชิกทีม'}</span>
          </div>
        </div>
        ${isSelected ? '<i class="fa-solid fa-check text-blue-600 text-xs"></i>' : ''}
      `;

      item.addEventListener('click', () => {
        switchUser(member);
        const userMenu = document.getElementById('user-dropdown-menu');
        if (userMenu) userMenu.style.display = 'none';
      });

      listEl.appendChild(item);
    });
  }

  function renderControls() {
    const filterSelect = document.getElementById('filter-assignee');
    if (filterSelect) {
      const currentVal = state.viewTargetAssignee;
      filterSelect.innerHTML = '';

      if (state.currentUser.role === 'manager') {
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = '👥 ทั้งหมดในทีม (ภาพรวม)';
        filterSelect.appendChild(allOpt);
      }

      state.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        const isSelf = m.id === state.currentUser.id;
        opt.textContent = `${isSelf ? '⭐ ' : ''}${m.name} ${isSelf ? '(บอร์ดของฉัน)' : ''}`;
        filterSelect.appendChild(opt);
      });

      filterSelect.value = currentVal;
    }

    const addTaskBtn = document.getElementById('btn-add-task');
    const addTaskLabel = document.getElementById('btn-add-task-label');

    if (addTaskBtn) {
      if (isReadOnlyMode()) {
        addTaskBtn.classList.add('opacity-50', 'pointer-events-none');
        if (addTaskLabel) addTaskLabel.textContent = 'ดูอย่างเดียว';
      } else {
        addTaskBtn.classList.remove('opacity-50', 'pointer-events-none');
        if (addTaskLabel) {
          addTaskLabel.textContent = state.currentUser.role === 'manager' ? '+ มอบหมายงานใหม่' : '+ เพิ่มงานของฉัน';
        }
      }
    }
  }

  function renderDashboard() {
    const dashboardSec = document.getElementById('manager-dashboard');
    if (!dashboardSec) return;
    
    if (state.currentUser.role !== 'manager') {
      dashboardSec.style.display = 'none';
      return;
    }
    dashboardSec.style.display = 'block';

    const allTasks = state.tasks;
    const total = allTasks.length;
    const inProgress = allTasks.filter(t => t.status === 'In Progress').length;
    const inReview = allTasks.filter(t => t.status === 'In Review').length;
    const done = allTasks.filter(t => t.status === 'Done').length;

    const todayStr = new Date().toISOString().split('T')[0];
    const overdueOrSoon = allTasks.filter(t => {
      if (t.status === 'Done' || !t.deadline) return false;
      const diffDays = Math.ceil((new Date(t.deadline) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    }).length;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('stat-total-tasks', total);
    setTxt('stat-progress-tasks', inProgress);
    setTxt('stat-review-tasks', inReview);
    setTxt('stat-done-tasks', done);
    setTxt('stat-overdue-tasks', overdueOrSoon);

    const gridEl = document.getElementById('team-workload-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    state.members.forEach(member => {
      const memberTasks = allTasks.filter(t => t.assignee === member.name);
      const mTotal = memberTasks.length;
      const mDone = memberTasks.filter(t => t.status === 'Done').length;
      const mActive = mTotal - mDone;
      const percent = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;

      const isCurrentFilter = state.viewTargetAssignee === member.name;

      const card = document.createElement('div');
      card.className = `p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
        isCurrentFilter 
          ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`;

      card.innerHTML = `
        <div class="flex items-center gap-2 mb-2">
          <div class="w-6 h-6 rounded-md text-white font-bold flex items-center justify-center text-[10px]"
               style="background-color: ${member.avatarColor || '#3B82F6'}">
            ${getInitials(member.name)}
          </div>
          <div class="overflow-hidden">
            <p class="text-xs font-semibold text-slate-800 truncate">${member.name}</p>
            <span class="text-[10px] text-slate-400">${member.role === 'manager' ? '👑 หัวหน้า' : '👤 ทีมงาน'}</span>
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-500">ค้างทำ: <b class="text-amber-600">${mActive}</b></span>
            <span class="text-slate-500">เสร็จ: <b class="text-emerald-600">${mDone}</b>/${mTotal}</span>
          </div>
          <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full transition-all" style="width: ${percent}%"></div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        state.viewTargetAssignee = member.name;
        renderAll();
      });

      gridEl.appendChild(card);
    });
  }

  function renderReadOnlyNotice() {
    const banner = document.getElementById('read-only-banner');
    const title = document.getElementById('read-only-title');
    if (!banner) return;

    if (isReadOnlyMode()) {
      banner.style.display = 'block';
      if (title) title.textContent = `🔒 กำลังดูงานของ: ${state.viewTargetAssignee} (โหมดอ่านอย่างเดียว)`;
    } else {
      banner.style.display = 'none';
    }
  }

  function renderKanbanBoard() {
    const statuses = ['To Do', 'In Progress', 'In Review', 'On Hold', 'Done'];
    const filteredTasks = getFilteredTasks();
    const readOnly = isReadOnlyMode();

    statuses.forEach(status => {
      const colContainer = document.querySelector(`.kanban-cards-area[data-status="${status}"]`);
      const countBadge = document.querySelector(`.kanban-column[data-status="${status}"] .column-count`);
      if (!colContainer) return;

      colContainer.innerHTML = '';
      const colTasks = filteredTasks.filter(t => t.status === status);
      if (countBadge) countBadge.textContent = colTasks.length;

      if (colTasks.length === 0) {
        colContainer.innerHTML = `
          <div class="h-32 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-center p-3">
            <i class="fa-regular fa-folder-open text-xl mb-1 text-slate-300"></i>
            <p class="text-[11px]">ไม่มีงานในสถานะนี้</p>
          </div>
        `;
      } else {
        colTasks.forEach(task => {
          const card = createKanbanCard(task, readOnly);
          colContainer.appendChild(card);
        });
      }

      if (!readOnly) {
        setupColumnDropEvents(colContainer, status);
      }
    });
  }

  function createKanbanCard(task, readOnly) {
    const card = document.createElement('div');
    const canEdit = !readOnly && (state.currentUser.role === 'manager' || state.currentUser.name === task.assignee);

    card.className = `task-card bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-2.5 relative group ${
      readOnly ? 'read-only' : ''
    }`;
    card.dataset.taskId = task.id;

    if (canEdit) {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    }

    let priorityBadge = '';
    if (task.priority === 'Urgent') {
      priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">🔴 ด่วนมาก</span>';
    } else if (task.priority === 'Medium') {
      priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">🟡 ปานกลาง</span>';
    } else {
      priorityBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">🟢 ปกติ</span>';
    }

    const deadlineInfo = formatDeadline(task.deadline, task.status === 'Done');

    const atts = (Array.isArray(task.attachments) && task.attachments.length > 0)
      ? task.attachments
      : (task.fileUrl ? [{ name: task.fileName || 'ไฟล์แนบ', url: task.fileUrl, directViewUrl: task.directViewUrl || task.fileUrl, type: task.fileType || '' }] : []);

    let attachmentHtml = '';
    if (atts.length > 0) {
      const firstImg = atts.find(a => isImageFile(a.type, a.name, a.url));
      if (firstImg) {
        const displayUrl = getDisplayableImageUrl(firstImg.url);
        attachmentHtml = `
          <div class="mt-2 relative rounded-lg overflow-hidden border border-slate-200 max-h-32 bg-slate-100 flex items-center justify-center">
            <img src="${displayUrl}" 
                 alt="${escapeHtml(firstImg.name || 'ไฟล์แนบ')}" 
                 referrerpolicy="no-referrer" 
                 loading="lazy"
                 onerror="window.TodoApp && window.TodoApp.handleImgError(this, '${escapeHtml(firstImg.url)}', '${escapeHtml(firstImg.name || 'ไฟล์ภาพ')}')"
                 class="w-full h-full object-cover max-h-32 hover:scale-105 transition duration-200">
            ${atts.length > 1 ? `
              <span class="absolute bottom-1.5 right-1.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                <i class="fa-solid fa-layer-group text-[9px]"></i> +${atts.length - 1} ไฟล์
              </span>
            ` : ''}
          </div>
        `;
      } else {
        attachmentHtml = `
          <div class="mt-1.5 flex items-center justify-between text-[11px] text-blue-600 bg-blue-50/70 px-2.5 py-1.5 rounded-lg border border-blue-100">
            <div class="flex items-center gap-1.5 truncate min-w-0">
              <i class="fa-solid fa-paperclip text-xs shrink-0"></i>
              <span class="truncate font-medium text-slate-700">${escapeHtml(atts[0].name || 'ดูไฟล์แนบ')}</span>
            </div>
            ${atts.length > 1 ? `
              <span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-semibold shrink-0 ml-1">
                +${atts.length - 1}
              </span>
            ` : ''}
          </div>
        `;
      }
    }

    const assigneeMember = state.members.find(m => m.name === task.assignee);
    const avatarColor = assigneeMember ? assigneeMember.avatarColor : '#3B82F6';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <div>${priorityBadge}</div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          ${canEdit ? `
            <button class="btn-card-edit p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 text-xs" title="แก้ไขงาน">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-card-delete p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 text-xs" title="ลบงาน">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
        </div>
      </div>

      <div>
        <h4 class="font-semibold text-slate-900 text-xs leading-snug line-clamp-2">${escapeHtml(task.title)}</h4>
        ${task.description ? `<p class="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">${escapeHtml(task.description)}</p>` : ''}
      </div>

      ${attachmentHtml}

      <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-1.5" title="ผู้รับผิดชอบ: ${escapeHtml(task.assignee)}">
          <div class="w-5 h-5 rounded-md text-white font-bold text-[9px] flex items-center justify-center shadow-2xs"
               style="background-color: ${avatarColor}">
            ${getInitials(task.assignee)}
          </div>
          <span class="text-slate-600 font-medium truncate max-w-[100px]">${escapeHtml(task.assignee.replace('คุณ ', ''))}</span>
        </div>
        <div>${deadlineInfo.badge}</div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-edit')) {
        e.stopPropagation();
        openTaskModal(task);
        return;
      }
      if (e.target.closest('.btn-card-delete')) {
        e.stopPropagation();
        confirmDeleteTask(task.id);
        return;
      }
      openDetailModal(task);
    });

    return card;
  }

  function renderTableView() {
    const tbody = document.getElementById('table-tasks-body');
    const emptyNotice = document.getElementById('table-empty-notice');
    if (!tbody) return;

    const filteredTasks = getFilteredTasks();
    tbody.innerHTML = '';

    if (filteredTasks.length === 0) {
      if (emptyNotice) emptyNotice.style.display = 'block';
      return;
    }
    if (emptyNotice) emptyNotice.style.display = 'none';

    filteredTasks.forEach(task => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition cursor-pointer';

      const canEdit = !isReadOnlyMode() && (state.currentUser.role === 'manager' || state.currentUser.name === task.assignee);
      const deadlineInfo = formatDeadline(task.deadline, task.status === 'Done');

      let statusClass = 'bg-slate-100 text-slate-700';
      if (task.status === 'To Do') statusClass = 'bg-blue-50 text-blue-700 border border-blue-200';
      if (task.status === 'In Progress') statusClass = 'bg-amber-50 text-amber-700 border border-amber-200';
      if (task.status === 'In Review') statusClass = 'bg-purple-50 text-purple-700 border border-purple-200';
      if (task.status === 'On Hold') statusClass = 'bg-slate-100 text-slate-700 border border-slate-200';
      if (task.status === 'Done') statusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200';

      const tAtts = (Array.isArray(task.attachments) && task.attachments.length > 0)
        ? task.attachments
        : (task.fileUrl ? [{ name: task.fileName || 'ไฟล์แนบ', url: task.fileUrl, directViewUrl: task.directViewUrl || task.fileUrl }] : []);

      let tableAttachHtml = '<span class="text-slate-300">-</span>';
      if (tAtts.length === 1) {
        tableAttachHtml = `<a href="${escapeHtml(tAtts[0].directViewUrl || tAtts[0].url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline flex items-center gap-1 text-xs truncate max-w-[140px]" title="${escapeHtml(tAtts[0].name || 'ไฟล์แนบ')}"><i class="fa-solid fa-paperclip"></i> <span class="truncate">${escapeHtml(tAtts[0].name || 'ไฟล์แนบ')}</span></a>`;
      } else if (tAtts.length > 1) {
        tableAttachHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 cursor-pointer hover:bg-blue-100 transition"><i class="fa-solid fa-paperclip"></i> ${tAtts.length} ไฟล์</span>`;
      }

      tr.innerHTML = `
        <td class="py-3 px-4">
          <p class="font-semibold text-slate-900">${escapeHtml(task.title)}</p>
          ${task.description ? `<p class="text-[11px] text-slate-400 truncate max-w-xs">${escapeHtml(task.description)}</p>` : ''}
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="font-medium text-slate-700">${escapeHtml(task.assignee)}</span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusClass}">${task.status}</span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <span class="text-[11px] font-medium text-slate-600">${task.priority}</span>
        </td>
        <td class="py-3 px-4 whitespace-nowrap text-slate-500">
          ${task.startDate || '-'}
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          ${deadlineInfo.badge}
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          ${tableAttachHtml}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-2">
            <button class="btn-table-view text-slate-500 hover:text-blue-600 text-xs" title="ดูรายละเอียด">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${canEdit ? `
              <button class="btn-table-edit text-slate-500 hover:text-amber-600 text-xs" title="แก้ไข">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-table-delete text-slate-500 hover:text-rose-600 text-xs" title="ลบ">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-table-view').addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(task);
      });

      if (canEdit) {
        tr.querySelector('.btn-table-edit').addEventListener('click', (e) => {
          e.stopPropagation();
          openTaskModal(task);
        });
        tr.querySelector('.btn-table-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          confirmDeleteTask(task.id);
        });
      }

      tr.addEventListener('click', () => openDetailModal(task));

      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // Drag and Drop Logic
  // =========================================================================

  let draggedTaskId = null;

  function handleDragStart(e) {
    draggedTaskId = this.dataset.taskId;
    this.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', draggedTaskId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.kanban-cards-area').forEach(col => col.classList.remove('drag-over'));
    draggedTaskId = null;
  }

  function setupColumnDropEvents(columnEl, columnStatus) {
    columnEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      columnEl.classList.add('drag-over');
    });

    columnEl.addEventListener('dragleave', (e) => {
      if (!columnEl.contains(e.relatedTarget)) {
        columnEl.classList.remove('drag-over');
      }
    });

    columnEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      columnEl.classList.remove('drag-over');
      const taskId = (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null) || draggedTaskId;
      if (!taskId) return;

      const task = state.tasks.find(t => t.id === taskId);
      if (!task || task.status === columnStatus) return;

      if (state.currentUser.role !== 'manager' && state.currentUser.name !== task.assignee) {
        alert('คุณไม่ได้รับอนุญาตให้เปลี่ยนสถานะงานของผู้อื่น');
        return;
      }

      task.status = columnStatus;
      renderAll();

      try {
        await api.updateStatus(taskId, columnStatus, state.currentUser.name);
      } catch (err) {
        console.error('Failed to sync status update:', err);
      }
    });
  }

  // =========================================================================
  // Modal: Add / Edit Task
  // =========================================================================

  function getFileIconHtml(name, type) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const mime = (type || '').toLowerCase();
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      return '<i class="fa-solid fa-image text-blue-500"></i>';
    }
    if (ext === 'pdf' || mime.includes('pdf')) {
      return '<i class="fa-solid fa-file-pdf text-rose-500"></i>';
    }
    if (['doc', 'docx'].includes(ext) || mime.includes('word') || mime.includes('officedocument.wordprocessingml')) {
      return '<i class="fa-solid fa-file-word text-blue-600"></i>';
    }
    if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet')) {
      return '<i class="fa-solid fa-file-excel text-emerald-600"></i>';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
      return '<i class="fa-solid fa-file-zipper text-amber-500"></i>';
    }
    return '<i class="fa-solid fa-file-lines text-slate-500"></i>';
  }

  function renderModalAttachmentsList() {
    const container = document.getElementById('attachments-list-container');
    const counter = document.getElementById('form-attachment-counter');
    if (!container) return;

    const count = state.modalAttachments.length;
    if (counter) counter.textContent = `${count} ไฟล์`;

    if (count === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = state.modalAttachments.map((att, idx) => {
      const isImg = isImageFile(att.type, att.name, att.previewUrl || att.url);
      const displayUrl = att.previewUrl || getDisplayableImageUrl(att.url);

      let thumbHtml = '';
      if (isImg && displayUrl) {
        thumbHtml = `
          <div class="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
            <img src="${displayUrl}" 
                 alt="${escapeHtml(att.name)}" 
                 referrerpolicy="no-referrer"
                 onerror="this.src=''; this.parentElement.innerHTML='<i class=\\'fa-solid fa-image text-blue-500 text-sm\\'></i>';"
                 class="w-full h-full object-cover">
          </div>
        `;
      } else {
        thumbHtml = `
          <div class="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 shrink-0 flex items-center justify-center text-sm">
            ${getFileIconHtml(att.name, att.type)}
          </div>
        `;
      }

      const statusBadge = att.isNew 
        ? `<span class="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-medium">รออัปโหลด ${att.sizeStr ? `• ${att.sizeStr}` : ''}</span>`
        : `<span class="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">ไฟล์เดิม</span>`;

      return `
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition gap-2 group">
          <div class="flex items-center gap-2 overflow-hidden min-w-0">
            ${thumbHtml}
            <div class="overflow-hidden min-w-0">
              <p class="font-medium text-slate-800 text-xs truncate" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</p>
              <div>${statusBadge}</div>
            </div>
          </div>
          <button type="button" 
                  class="btn-delete-modal-att p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition shrink-0 cursor-pointer" 
                  data-index="${idx}" 
                  title="ลบไฟล์นี้">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-delete-modal-att').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        if (!isNaN(index) && index >= 0 && index < state.modalAttachments.length) {
          state.modalAttachments.splice(index, 1);
          renderModalAttachmentsList();
        }
      };
    });
  }

  function addFilesToModal(filesList) {
    if (!filesList || filesList.length === 0) return;
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const sizeKb = Math.round(file.size / 1024);
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      let previewUrl = '';
      if (file.type && file.type.startsWith('image/')) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch (e) {
          previewUrl = '';
        }
      }
      state.modalAttachments.push({
        name: file.name,
        type: file.type,
        file: file,
        sizeStr: sizeStr,
        previewUrl: previewUrl,
        isNew: true
      });
    }
    renderModalAttachmentsList();
  }

  function openTaskModal(task = null) {
    const modal = document.getElementById('task-modal');
    const titleEl = document.getElementById('modal-task-title');
    const form = document.getElementById('task-form');
    const assigneeSelect = document.getElementById('form-assignee');
    const assigneeHint = document.getElementById('form-assignee-hint');

    state.editingTaskId = task ? task.id : null;
    state.modalAttachments = [];

    if (assigneeSelect) {
      assigneeSelect.innerHTML = '';
      state.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.role === 'manager' ? 'หัวหน้า' : 'ทีมงาน'})`;
        assigneeSelect.appendChild(opt);
      });

      if (state.currentUser.role === 'manager') {
        assigneeSelect.disabled = false;
        if (assigneeHint) assigneeHint.style.display = 'none';
      } else {
        assigneeSelect.value = state.currentUser.name;
        assigneeSelect.disabled = true;
        if (assigneeHint) assigneeHint.style.display = 'block';
      }
    }

    const fileInput = document.getElementById('form-file-input');
    if (fileInput) fileInput.value = '';

    if (task) {
      if (titleEl) titleEl.textContent = 'แก้ไขงาน';
      document.getElementById('form-task-id').value = task.id;
      document.getElementById('form-title').value = task.title;
      document.getElementById('form-description').value = task.description || '';
      if (assigneeSelect) assigneeSelect.value = task.assignee;
      document.getElementById('form-status').value = task.status;
      document.getElementById('form-priority').value = task.priority || 'Normal';
      document.getElementById('form-start-date').value = task.startDate || '';
      document.getElementById('form-deadline').value = task.deadline || '';

      const atts = (Array.isArray(task.attachments) && task.attachments.length > 0)
        ? task.attachments
        : (task.fileUrl ? [{ name: task.fileName || 'ไฟล์แนบ', url: task.fileUrl, directViewUrl: task.directViewUrl || task.fileUrl, type: task.fileType || '' }] : []);

      state.modalAttachments = atts.map(a => ({
        name: a.name || 'ไฟล์แนบ',
        url: a.url || '',
        directViewUrl: a.directViewUrl || a.url || '',
        type: a.type || '',
        isNew: false
      }));
    } else {
      if (titleEl) titleEl.textContent = state.currentUser.role === 'manager' ? 'มอบหมายงานใหม่' : 'เพิ่มงานใหม่ของฉัน';
      if (form) form.reset();
      document.getElementById('form-task-id').value = '';
      
      if (assigneeSelect) {
        if (state.currentUser.role === 'manager' && state.viewTargetAssignee !== 'all') {
          assigneeSelect.value = state.viewTargetAssignee;
        } else {
          assigneeSelect.value = state.currentUser.name;
        }
      }

      document.getElementById('form-status').value = 'To Do';
      document.getElementById('form-priority').value = 'Normal';
      document.getElementById('form-start-date').value = new Date().toISOString().split('T')[0];
    }

    renderModalAttachmentsList();

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
    }
  }

  function closeTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    state.editingTaskId = null;
    state.modalAttachments = [];
    renderModalAttachmentsList();
  }

  // =========================================================================
  // Modal: Task Detail View (Quick Preview)
  // =========================================================================

  function openDetailModal(task) {
    const modal = document.getElementById('detail-modal');

    document.getElementById('detail-title').textContent = task.title;
    document.getElementById('detail-description').textContent = task.description || 'ไม่มีรายละเอียดเพิ่มเติม';
    document.getElementById('detail-assignee').textContent = task.assignee;
    document.getElementById('detail-createdby').textContent = task.createdBy || '-';
    document.getElementById('detail-startdate').textContent = task.startDate || '-';
    document.getElementById('detail-deadline').textContent = task.deadline || '-';

    const statusBadge = document.getElementById('detail-status-badge');
    if (statusBadge) {
      statusBadge.textContent = task.status;
      if (task.status === 'Done') {
        statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800';
      } else if (task.status === 'In Progress') {
        statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800';
      } else if (task.status === 'In Review') {
        statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800';
      } else {
        statusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800';
      }
    }

    const prioBadge = document.getElementById('detail-priority-badge');
    if (prioBadge) {
      prioBadge.textContent = `ระดับ: ${task.priority || 'Normal'}`;
      prioBadge.className = task.priority === 'Urgent' 
        ? 'text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800' 
        : 'text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700';
    }

    const deadlineAlert = document.getElementById('detail-deadline-alert');
    const dInfo = formatDeadline(task.deadline, task.status === 'Done');
    if (deadlineAlert) deadlineAlert.innerHTML = dInfo.badge;

    const assigneeMember = state.members.find(m => m.name === task.assignee);
    const avatarEl = document.getElementById('detail-assignee-avatar');
    if (avatarEl) {
      avatarEl.textContent = getInitials(task.assignee);
      avatarEl.style.backgroundColor = assigneeMember ? assigneeMember.avatarColor : '#3B82F6';
    }

    const attachBox = document.getElementById('detail-attachment-box');
    const attachContent = document.getElementById('detail-attachment-content');
    const attachCountEl = document.getElementById('detail-attachment-count');

    const atts = (Array.isArray(task.attachments) && task.attachments.length > 0)
      ? task.attachments
      : (task.fileUrl ? [{ name: task.fileName || 'ไฟล์แนบ', url: task.fileUrl, directViewUrl: task.directViewUrl || task.fileUrl, type: task.fileType || '' }] : []);

    if (atts.length > 0 && attachBox && attachContent) {
      attachBox.style.display = 'block';
      attachBox.classList.remove('hidden');
      if (attachCountEl) attachCountEl.textContent = `${atts.length} ไฟล์`;

      const images = atts.filter(a => isImageFile(a.type, a.name, a.url));
      const docs = atts.filter(a => !isImageFile(a.type, a.name, a.url));

      let imagesHtml = '';
      if (images.length > 0) {
        imagesHtml = `
          <div class="space-y-1.5">
            <span class="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
              <i class="fa-solid fa-images mr-1 text-blue-500"></i> รูปภาพ (${images.length})
            </span>
            <div class="grid ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'} gap-2">
              ${images.map(img => {
                const displayUrl = getDisplayableImageUrl(img.url);
                return `
                  <div class="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center cursor-pointer shadow-xs"
                       onclick="window.open('${escapeHtml(img.directViewUrl || img.url)}', '_blank', 'noopener,noreferrer')">
                    <img src="${displayUrl}" 
                         alt="${escapeHtml(img.name || 'รูปภาพ')}" 
                         referrerpolicy="no-referrer"
                         loading="lazy"
                         onerror="window.TodoApp && window.TodoApp.handleImgError(this, '${escapeHtml(img.url)}', '${escapeHtml(img.name || 'ไฟล์ภาพ')}')"
                         class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                    <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i>
                      <span>ดูขนาดเต็ม</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      let docsHtml = '';
      if (docs.length > 0) {
        docsHtml = `
          <div class="space-y-1.5 ${images.length > 0 ? 'mt-3 pt-3 border-t border-slate-100' : ''}">
            <span class="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
              <i class="fa-solid fa-file mr-1 text-slate-400"></i> เอกสาร / ไฟล์อื่นๆ (${docs.length})
            </span>
            <div class="space-y-1.5">
              ${docs.map(doc => `
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/80 transition gap-2">
                  <div class="flex items-center gap-2 overflow-hidden min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                      ${getFileIconHtml(doc.name, doc.type)}
                    </div>
                    <div class="overflow-hidden min-w-0">
                      <p class="font-semibold text-slate-800 text-xs truncate" title="${escapeHtml(doc.name || 'เอกสารแนบ')}">${escapeHtml(doc.name || 'เอกสารแนบ')}</p>
                      <span class="text-[10px] text-slate-400">Google Drive</span>
                    </div>
                  </div>
                  <a href="${escapeHtml(doc.directViewUrl || doc.url)}" target="_blank" rel="noopener noreferrer" 
                     class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold shadow-xs transition shrink-0 flex items-center gap-1">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> เปิดดู
                  </a>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      attachContent.innerHTML = imagesHtml + docsHtml;
    } else if (attachBox) {
      attachBox.style.display = 'none';
      attachBox.classList.add('hidden');
    }

    const footer = document.getElementById('detail-modal-footer');
    const canEdit = !isReadOnlyMode() && (state.currentUser.role === 'manager' || state.currentUser.name === task.assignee);

    if (footer) {
      if (canEdit) {
        footer.style.display = 'flex';
        document.getElementById('btn-detail-edit').onclick = () => {
          closeDetailModal();
          openTaskModal(task);
        };
        document.getElementById('btn-detail-delete').onclick = () => {
          confirmDeleteTask(task.id);
          closeDetailModal();
        };
      } else {
        footer.style.display = 'none';
      }
    }

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
    }
  }

  function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
  }

  // =========================================================================
  // Delete Task
  // =========================================================================

  async function confirmDeleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!confirm(`คุณต้องการลบงาน "${task.title}" ใช่หรือไม่?`)) return;

    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();

    try {
      await api.deleteTask(taskId, state.currentUser.name);
    } catch (err) {
      console.error('Failed to sync deletion:', err);
    }
  }

  // =========================================================================
  // Switch User Logic
  // =========================================================================

  function switchUser(member) {
    state.currentUser = member;
    safeStorage.setItem('team_todo_current_user_id', member.id);

    if (member.role === 'manager') {
      state.viewTargetAssignee = 'all';
    } else {
      state.viewTargetAssignee = member.name;
    }

    renderAll();
  }

  // =========================================================================
  // Settings & Connection Modal Logic
  // =========================================================================

  function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('setting-api-url');
    const statusMsg = document.getElementById('connection-status-msg');

    if (input) input.value = api.getApiUrl();
    if (statusMsg) statusMsg.style.display = 'none';
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
    }
  }

  function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
  }

  function updateSyncBadge() {
    const badge = document.getElementById('backend-badge');
    if (!badge) return;
    if (api.isLiveMode()) {
      badge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>เชื่อมต่อ Google Sheet แล้ว</span>';
    } else {
      badge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>โหมดทดลอง (Mock Data)</span>';
    }
  }

  // =========================================================================
  // Helper Functions
  // =========================================================================

  function getFilteredTasks() {
    let list = [...state.tasks];

    if (state.viewTargetAssignee !== 'all') {
      list = list.filter(t => t.assignee === state.viewTargetAssignee);
    }

    if (state.priorityFilter !== 'all') {
      list = list.filter(t => t.priority === state.priorityFilter);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.assignee && t.assignee.toLowerCase().includes(q))
      );
    }

    return list;
  }

  function isReadOnlyMode() {
    if (state.currentUser.role === 'manager') return false;
    return state.viewTargetAssignee !== state.currentUser.name;
  }

  function getInitials(name) {
    if (!name) return '??';
    const clean = name.replace('คุณ ', '').trim();
    const parts = clean.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] || '') + (parts[1][0] || '');
    }
    return clean.substring(0, 2);
  }

  function formatDeadline(deadlineStr, isDone) {
    if (!deadlineStr) {
      return { badge: '<span class="text-slate-400 text-[10px]">ไม่มีกำหนด</span>', status: 'none' };
    }

    if (isDone) {
      return { badge: `<span class="text-emerald-600 text-[10px] font-medium"><i class="fa-solid fa-check mr-0.5"></i> ${deadlineStr}</span>`, status: 'done' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const diffDays = Math.ceil((new Date(deadlineStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        badge: `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse"><i class="fa-solid fa-triangle-exclamation mr-0.5"></i> เลยกำหนด ${Math.abs(diffDays)} วัน</span>`,
        status: 'overdue'
      };
    } else if (diffDays === 0) {
      return {
        badge: `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fa-regular fa-clock mr-0.5"></i> ครบกำหนดวันนี้</span>`,
        status: 'today'
      };
    } else if (diffDays <= 2) {
      return {
        badge: `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">เหลืออีก ${diffDays} วัน</span>`,
        status: 'soon'
      };
    } else {
      return {
        badge: `<span class="text-slate-500 text-[10px] font-medium"><i class="fa-regular fa-calendar mr-0.5"></i> ${deadlineStr}</span>`,
        status: 'normal'
      };
    }
  }

  function isImageFile(mimeType, fileName, url) {
    if (mimeType && mimeType.startsWith('image/')) return true;
    const target = (fileName || url || '').toLowerCase();
    return target.endsWith('.png') || target.endsWith('.jpg') || target.endsWith('.jpeg') || target.endsWith('.webp') || target.endsWith('.gif');
  }

  function getDisplayableImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    
    // Google Drive URL format conversion
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                       url.match(/id=([a-zA-Z0-9_-]+)/) ||
                       url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      const fileId = driveMatch[1];
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
    return url;
  }

  function handleImgError(imgEl, originalUrl, fileName) {
    if (!imgEl) return;
    const driveMatch = (originalUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                       (originalUrl || '').match(/id=([a-zA-Z0-9_-]+)/) ||
                       (originalUrl || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    
    // Attempt 1: Try drive.google.com/thumbnail
    if (driveMatch && driveMatch[1] && !imgEl.dataset.triedThumb) {
      imgEl.dataset.triedThumb = '1';
      imgEl.src = `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
      return;
    }

    // Attempt 2: Try drive.google.com/uc?export=view
    if (driveMatch && driveMatch[1] && !imgEl.dataset.triedUc) {
      imgEl.dataset.triedUc = '1';
      imgEl.src = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
      return;
    }

    // Fallback: If Google Workspace domain blocks external embedding, transform to clean clickable badge
    const parent = imgEl.parentElement;
    if (parent) {
      parent.className = 'mt-2 p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-700 flex items-center justify-between text-xs hover:bg-blue-100 transition cursor-pointer';
      parent.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">
            <i class="fa-solid fa-image"></i>
          </div>
          <span class="truncate font-semibold text-slate-800">${escapeHtml(fileName || 'รูปภาพแนบ')}</span>
        </div>
        <span class="text-[10px] text-blue-600 font-medium shrink-0 flex items-center gap-1">
          เปิดดู <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </span>
      `;
      parent.onclick = (e) => {
        e.stopPropagation();
        window.open(originalUrl, '_blank', 'noopener,noreferrer');
      };
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // Setup Event Listeners
  // =========================================================================

  function setupEventListeners() {
    const userBtn = document.getElementById('user-menu-button');
    const userMenu = document.getElementById('user-dropdown-menu');
    if (userBtn && userMenu) {
      userBtn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = userMenu.style.display === 'none' || userMenu.classList.contains('hidden');
        userMenu.style.display = isHidden ? 'block' : 'none';
        userMenu.classList.toggle('hidden', !isHidden);
      };

      document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target) && !userBtn.contains(e.target)) {
          userMenu.style.display = 'none';
          userMenu.classList.add('hidden');
        }
      });
    }

    const filterAssignee = document.getElementById('filter-assignee');
    if (filterAssignee) {
      filterAssignee.onchange = (e) => {
        state.viewTargetAssignee = e.target.value;
        renderAll();
      };
    }

    const filterPriority = document.getElementById('filter-priority');
    if (filterPriority) {
      filterPriority.onchange = (e) => {
        state.priorityFilter = e.target.value;
        renderAll();
      };
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        state.searchQuery = e.target.value.trim();
        if (state.viewMode === 'kanban') {
          renderKanbanBoard();
        } else {
          renderTableView();
        }
      };
    }

    const kanbanBtn = document.getElementById('view-kanban-btn');
    const tableBtn = document.getElementById('view-table-btn');

    if (kanbanBtn && tableBtn) {
      kanbanBtn.onclick = () => {
        state.viewMode = 'kanban';
        kanbanBtn.className = 'px-3 py-1 text-xs font-medium rounded-md bg-white text-blue-600 shadow-sm transition';
        tableBtn.className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 transition';
        renderAll();
      };

      tableBtn.onclick = () => {
        state.viewMode = 'table';
        tableBtn.className = 'px-3 py-1 text-xs font-medium rounded-md bg-white text-blue-600 shadow-sm transition';
        kanbanBtn.className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 transition';
        renderAll();
      };
    }

    const btnAddTask = document.getElementById('btn-add-task');
    if (btnAddTask) {
      btnAddTask.onclick = () => {
        if (isReadOnlyMode()) return;
        openTaskModal();
      };
    }

    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    };

    bindClick('btn-close-task-modal', closeTaskModal);
    bindClick('btn-cancel-task', closeTaskModal);
    bindClick('btn-close-detail-modal', closeDetailModal);

    bindClick('btn-open-settings', openSettingsModal);
    bindClick('btn-close-settings-modal', closeSettingsModal);

    bindClick('btn-back-to-my-board', () => {
      state.viewTargetAssignee = state.currentUser.name;
      renderAll();
    });

    bindClick('btn-test-connection', async () => {
      const testUrl = document.getElementById('setting-api-url').value.trim();
      const statusEl = document.getElementById('connection-status-msg');
      const btn = document.getElementById('btn-test-connection');

      if (!testUrl) {
        statusEl.className = 'mt-2 p-2 rounded-lg text-[11px] bg-amber-50 text-amber-700 border border-amber-200 block';
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> กรุณากรอก Web App URL ก่อนกดทดสอบ';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'กำลังทดสอบ...';
      statusEl.className = 'mt-2 p-2 rounded-lg text-[11px] bg-blue-50 text-blue-700 border border-blue-200 block';
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> กำลังส่งคำขอไปยัง Google Apps Script...';

      try {
        const res = await api.testConnection(testUrl);
        statusEl.className = 'mt-2 p-2 rounded-lg text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 block';
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> เชื่อมต่อสำเร็จ! พบข้อมูลงาน ${res.data.tasks ? res.data.tasks.length : 0} รายการ และสมาชิก ${res.data.members ? res.data.members.length : 0} คน ใน Google Sheet`;
      } catch (err) {
        statusEl.className = 'mt-2 p-2 rounded-lg text-[11px] bg-rose-50 text-rose-700 border border-rose-200 block';
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i> ${err.message}`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'ทดสอบการเชื่อมต่อ';
      }
    });

    bindClick('btn-save-settings', async () => {
      const newUrl = document.getElementById('setting-api-url').value.trim();
      api.setApiUrl(newUrl);
      closeSettingsModal();
      updateSyncBadge();
      await loadData();
    });

    bindClick('btn-reset-mock-data', () => {
      if (confirm('คุณต้องการรีเซ็ตข้อมูลทดลองทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?')) {
        api.resetLocalData();
        closeSettingsModal();
        loadData();
      }
    });

    const taskForm = document.getElementById('task-form');
    if (taskForm) {
      taskForm.onsubmit = async (e) => {
        e.preventDefault();

        const title = document.getElementById('form-title').value.trim();
        const description = document.getElementById('form-description').value.trim();
        const assignee = document.getElementById('form-assignee').value;
        const status = document.getElementById('form-status').value;
        const priority = document.getElementById('form-priority').value;
        const startDate = document.getElementById('form-start-date').value;
        const deadline = document.getElementById('form-deadline').value;

        if (!title) {
          alert('กรุณากรอกชื่องาน');
          return;
        }

        const submitBtn = document.getElementById('btn-submit-task');
        const submitText = document.getElementById('submit-btn-text');
        const submitSpinner = document.getElementById('submit-btn-spinner');

        submitBtn.disabled = true;
        submitText.textContent = 'กำลังบันทึก...';
        if (submitSpinner) submitSpinner.classList.remove('hidden');

        try {
          const finalAttachments = [];
          const newAtts = state.modalAttachments.filter(a => a.isNew && a.file);
          
          if (newAtts.length > 0) {
            submitText.textContent = `กำลังอัปโหลดไฟล์ (0/${newAtts.length})...`;
          }

          let uploadedCount = 0;
          for (let i = 0; i < state.modalAttachments.length; i++) {
            const item = state.modalAttachments[i];
            if (item.isNew && item.file) {
              uploadedCount++;
              submitText.textContent = `กำลังอัปโหลดไฟล์ (${uploadedCount}/${newAtts.length})...`;
              const res = await api.uploadFile(item.file);
              finalAttachments.push({
                name: res.fileName || item.name,
                url: res.fileUrl,
                directViewUrl: res.directViewUrl || res.fileUrl,
                type: res.fileType || item.type
              });
            } else if (item.url) {
              finalAttachments.push({
                name: item.name || 'ไฟล์แนบ',
                url: item.url,
                directViewUrl: item.directViewUrl || item.url,
                type: item.type || ''
              });
            }
          }

          submitText.textContent = 'กำลังบันทึกข้อมูล...';

          const firstAtt = finalAttachments[0] || {};
          const fileUrl = firstAtt.url || '';
          const fileName = firstAtt.name || '';
          const fileType = firstAtt.type || '';

          if (state.editingTaskId) {
            const taskData = {
              id: state.editingTaskId,
              title,
              description,
              assignee,
              status,
              priority,
              startDate,
              deadline,
              fileUrl,
              fileName,
              fileType,
              attachments: finalAttachments
            };

            await api.updateTask(taskData);
            const idx = state.tasks.findIndex(t => t.id === state.editingTaskId);
            if (idx !== -1) {
              state.tasks[idx] = { ...state.tasks[idx], ...taskData };
            }
          } else {
            const newTaskData = {
              title,
              description,
              assignee,
              createdBy: state.currentUser.name,
              status,
              priority,
              startDate,
              deadline,
              fileUrl,
              fileName,
              fileType,
              attachments: finalAttachments
            };

            const created = await api.createTask(newTaskData);
            state.tasks.unshift(created);
          }

          closeTaskModal();
          renderAll();
        } catch (err) {
          console.error('Error saving task:', err);
          alert('เกิดข้อผิดพลาดในการบันทึกงาน: ' + err.message);
        } finally {
          submitBtn.disabled = false;
          submitText.textContent = 'บันทึกข้อมูล';
          if (submitSpinner) submitSpinner.classList.add('hidden');
        }
      };
    }

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('form-file-input');

    if (dropZone && fileInput) {
      dropZone.onclick = (e) => {
        if (e.target !== fileInput) {
          fileInput.click();
        }
      };

      dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500', 'bg-blue-50/70');
      };

      dropZone.ondragleave = (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50/70');
      };

      dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50/70');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addFilesToModal(e.dataTransfer.files);
        }
      };

      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          addFilesToModal(e.target.files);
          e.target.value = '';
        }
      };
    }

    bindClick('btn-remove-file', () => {
      state.selectedFile = null;
      state.modalAttachments = [];
      renderModalAttachmentsList();
    });

    ['task-modal', 'detail-modal', 'settings-modal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.onclick = (e) => {
          if (e.target === modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
          }
        };
      }
    });
  }

  // Export to Global window.TodoApp
  window.TodoApp = {
    openSettingsModal,
    closeSettingsModal,
    openTaskModal,
    closeTaskModal,
    openDetailModal,
    closeDetailModal,
    switchUser,
    toggleUserMenu,
    handleImgError,
    state
  };

  function toggleUserMenu() {
    const userMenu = document.getElementById('user-dropdown-menu');
    if (!userMenu) return;
    const isHidden = userMenu.style.display === 'none' || userMenu.classList.contains('hidden');
    userMenu.style.display = isHidden ? 'block' : 'none';
    userMenu.classList.toggle('hidden', !isHidden);
  }

})();
