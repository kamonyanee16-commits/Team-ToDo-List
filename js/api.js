/**
 * API Handler for Team To Do List
 * Supports both Live Google Apps Script (GAS) Web App and Local Mock/Demo Mode
 */

(function () {
  'use strict';

  // Safe Storage to prevent SecurityError when opened directly as file:///
  const safeStorage = {
    memory: {},
    getItem(key) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch (e) {
        console.warn('localStorage not accessible, using memory storage:', e);
      }
      return this.memory[key] || null;
    },
    setItem(key, val) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, String(val));
          return;
        }
      } catch (e) {
        console.warn('localStorage write failed, using memory storage:', e);
      }
      this.memory[key] = String(val);
    },
    removeItem(key) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          return;
        }
      } catch (e) {
        // ignore
      }
      delete this.memory[key];
    }
  };

  const API_CONFIG_KEY = 'team_todo_api_url';
  const LOCAL_TASKS_KEY = 'team_todo_local_tasks';
  const LOCAL_MEMBERS_KEY = 'team_todo_local_members';

  // สามารถนำ Web App URL มาใส่ตรงนี้ได้โดยตรง (หรือจะกดใส่ผ่านปุ่มหน้าเว็บก็ได้)
  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwVCoaAw2YaBgwQI0z7X3GR3ihvg9GzHzN_8UGstR6bT6FC4vA70yBy_1SHsHpXC0N2Tw/exec';

  // รายชื่อสมาชิกเริ่มต้น
  const INITIAL_MEMBERS = [
    { id: 'm1', name: 'คุณ นาวิน บุญสุวรรณ', role: 'manager', avatarColor: '#2563EB', title: 'หัวหน้างาน' },
    { id: 'm2', name: 'คุณ กมลญาณี เฉลยพงษ์', role: 'member', avatarColor: '#EC4899', title: 'ทีมงาน' },
    { id: 'm3', name: 'คุณ ภัสสร อยู่ป้อม', role: 'member', avatarColor: '#10B981', title: 'ทีมงาน' },
    { id: 'm4', name: 'คุณ กลรัตน์ สกุลมา', role: 'member', avatarColor: '#F59E0B', title: 'ทีมงาน' },
    { id: 'm5', name: 'คุณ นัทธมน รอดแสวง', role: 'member', avatarColor: '#8B5CF6', title: 'ทีมงาน' }
  ];

  // ข้อมูลงานตัวอย่างเริ่มต้น สำหรับโหมด Demo
  const INITIAL_MOCK_TASKS = [
    {
      id: 'task_1',
      title: 'วางแผนกลยุทธ์และ KPI ไตรมาส 1',
      description: 'ทบทวนเป้าหมายของทีมและจัดทำ Action Plan พร้อมกำหนดวันส่งมอบงานของทุกคน',
      assignee: 'คุณ นาวิน บุญสุวรรณ',
      createdBy: 'คุณ นาวิน บุญสุวรรณ',
      startDate: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      status: 'In Progress',
      priority: 'Urgent',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_2',
      title: 'ออกแบบหน้าจอ UI สำหรับระบบจัดเก็บเอกสาร',
      description: 'จัดทำ Wireframe และ UI Mockup ให้ผู้ใช้งานตรวจสอบความถูกต้องของ Flow งาน',
      assignee: 'คุณ กมลญาณี เฉลยพงษ์',
      createdBy: 'คุณ นาวิน บุญสุวรรณ',
      startDate: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      status: 'In Progress',
      priority: 'Urgent',
      fileUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80',
      fileName: 'ui_mockup_preview.png',
      fileType: 'image/png',
      attachments: [
        {
          name: 'ui_mockup_preview.png',
          url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80',
          directViewUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80',
          type: 'image/png'
        }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_3',
      title: 'จัดทำคู่มือการใช้งานระบบใหม่สำหรับพนักงาน',
      description: 'เขียนอธิบายขั้นตอนการลงทะเบียนและส่งคำขออนุมัติเอกสาร',
      assignee: 'คุณ กมลญาณี เฉลยพงษ์',
      createdBy: 'คุณ กมลญาณี เฉลยพงษ์',
      startDate: new Date().toISOString().split('T')[0],
      deadline: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
      status: 'To Do',
      priority: 'Normal',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_4',
      title: 'ตรวจสอบยอดกระทบยอดบัญชีประจำสัปดาห์',
      description: 'เปรียบเทียบรายการรับ-จ่ายกับสลิปโอนเงินและ Statement ของธนาคาร',
      assignee: 'คุณ ภัสสร อยู่ป้อม',
      createdBy: 'คุณ ภัสสร อยู่ป้อม',
      startDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
      status: 'In Review',
      priority: 'Urgent',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_5',
      title: 'จัดเตรียมเอกสารสัญญาคู่ค้าและใบเสนอราคา',
      description: 'ประสานงานกับฝ่ายจัดซื้อเพื่อขอข้อมูลประกอบการทำสัญญาและเตรียมส่งเซ็น',
      assignee: 'คุณ กลรัตน์ สกุลมา',
      createdBy: 'คุณ นาวิน บุญสุวรรณ',
      startDate: new Date().toISOString().split('T')[0],
      deadline: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      status: 'To Do',
      priority: 'Medium',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_6',
      title: 'รอผลตรวจสอบสเปกอุปกรณ์จากซัพพลายเออร์',
      description: 'ทางซัพพลายเออร์ยังไม่ได้ส่งใบรับรองมาตรฐาน มอก. จึงยังไม่สามารถเดินเรื่องจัดซื้อต่อได้',
      assignee: 'คุณ กลรัตน์ สกุลมา',
      createdBy: 'คุณ กลรัตน์ สกุลมา',
      startDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
      status: 'On Hold',
      priority: 'Medium',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'task_7',
      title: 'สำรวจความพึงพอใจของลูกค้าประจำเดือน',
      description: 'ส่งแบบสอบถามออนไลน์ไปยังกลุ่มลูกค้าหลักและประมวลผลคะแนน CSAT / NPS',
      assignee: 'คุณ นัทธมน รอดแสวง',
      createdBy: 'คุณ นัทธมน รอดแสวง',
      startDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      deadline: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
      status: 'Done',
      priority: 'Normal',
      fileUrl: '',
      fileName: '',
      fileType: '',
      createdAt: new Date().toISOString()
    }
  ];

  /**
   * บีบอัดรูปภาพให้อยู่ในขนาดที่เหมาะสมอัตโนมัติ เพื่อให้อัปโหลดเร็วและไม่ติด Quota
   */
  function compressImageIfNeeded(file, maxDimension = 1200, quality = 0.8) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  /**
   * ปรับโครงสร้างข้อมูลงานให้มี attachments เป็น Array เสมอ เพื่อความเข้ากันได้
   */
  function normalizeTask(task) {
    if (!task) return task;
    let attachments = Array.isArray(task.attachments) ? [...task.attachments] : [];
    
    if (attachments.length === 0 && task.fileUrl) {
      const trimmed = String(task.fileUrl).trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) attachments = parsed;
        } catch (e) {
          attachments = [{
            name: task.fileName || 'ไฟล์แนบ',
            url: task.fileUrl,
            directViewUrl: task.fileUrl,
            type: task.fileType || ''
          }];
        }
      } else {
        attachments = [{
          name: task.fileName || 'ไฟล์แนบ',
          url: task.fileUrl,
          directViewUrl: task.directViewUrl || task.fileUrl,
          type: task.fileType || ''
        }];
      }
    }

    const first = attachments[0] || {};
    return {
      ...task,
      attachments: attachments,
      fileUrl: first.url || task.fileUrl || '',
      fileName: first.name || task.fileName || '',
      fileType: first.type || task.fileType || ''
    };
  }

  class TodoApi {
    constructor() {
      this.apiUrl = safeStorage.getItem(API_CONFIG_KEY) || DEFAULT_API_URL || '';
      this.initLocalData();
    }

    getApiUrl() {
      return this.apiUrl;
    }

    setApiUrl(url) {
      this.apiUrl = (url || '').trim();
      if (this.apiUrl) {
        safeStorage.setItem(API_CONFIG_KEY, this.apiUrl);
      } else {
        safeStorage.removeItem(API_CONFIG_KEY);
      }
    }

    isLiveMode() {
      return Boolean(this.apiUrl && this.apiUrl.startsWith('https://script.google.com'));
    }

    initLocalData() {
      if (!safeStorage.getItem(LOCAL_MEMBERS_KEY)) {
        safeStorage.setItem(LOCAL_MEMBERS_KEY, JSON.stringify(INITIAL_MEMBERS));
      }
      if (!safeStorage.getItem(LOCAL_TASKS_KEY)) {
        safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(INITIAL_MOCK_TASKS));
      }
    }

    async testConnection(urlToTest) {
      const url = (urlToTest || this.apiUrl || '').trim();
      if (!url) throw new Error('กรุณาระบุ URL ของ Google Apps Script');

      try {
        const response = await fetch(`${url}?action=getAll`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const json = await response.json();
        if (!json || json.success === false) {
          throw new Error(json.error || 'ไม่สามารถรับข้อมูลจาก Google Sheets ได้');
        }
        return { success: true, data: json.data };
      } catch (err) {
        console.error('Test Connection Error:', err);
        throw new Error(`เชื่อมต่อไม่สำเร็จ: ${err.message}`);
      }
    }

    async fetchInitialData() {
      if (this.isLiveMode()) {
        try {
          const response = await fetch(`${this.apiUrl}?action=getAll`);
          const json = await response.json();
          if (json.success && json.data) {
            if (json.data.members && json.data.members.length > 0) {
              safeStorage.setItem(LOCAL_MEMBERS_KEY, JSON.stringify(json.data.members));
            }
            const normalizedTasks = (json.data.tasks || []).map(normalizeTask);
            safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(normalizedTasks));
            return {
              members: json.data.members && json.data.members.length ? json.data.members : INITIAL_MEMBERS,
              tasks: normalizedTasks
            };
          }
        } catch (err) {
          console.warn('Live API fetch failed, falling back to cached local data:', err);
        }
      }

      let members = INITIAL_MEMBERS;
      let tasks = INITIAL_MOCK_TASKS;
      try {
        const storedM = safeStorage.getItem(LOCAL_MEMBERS_KEY);
        if (storedM) members = JSON.parse(storedM);
      } catch (e) {
        members = INITIAL_MEMBERS;
      }
      try {
        const storedT = safeStorage.getItem(LOCAL_TASKS_KEY);
        if (storedT) tasks = JSON.parse(storedT);
      } catch (e) {
        tasks = INITIAL_MOCK_TASKS;
      }

      return { members, tasks: (tasks || []).map(normalizeTask) };
    }

    async createTask(taskData) {
      const cleanTask = normalizeTask(taskData);

      if (this.isLiveMode()) {
        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'createTask',
              task: cleanTask
            })
          });
          const json = await response.json();
          if (json.success) {
            return normalizeTask(json.data);
          }
        } catch (err) {
          console.error('Live createTask failed:', err);
        }
      }

      let tasks = [];
      try {
        const stored = safeStorage.getItem(LOCAL_TASKS_KEY);
        if (stored) tasks = JSON.parse(stored);
      } catch (e) {}

      const newTask = normalizeTask({
        ...cleanTask,
        id: 'task_' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      tasks.unshift(newTask);
      safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
      return newTask;
    }

    async updateTask(taskData) {
      const cleanTask = normalizeTask(taskData);

      if (this.isLiveMode()) {
        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'updateTask',
              task: cleanTask
            })
          });
          const json = await response.json();
          if (json.success) return true;
        } catch (err) {
          console.error('Live updateTask failed:', err);
        }
      }

      let tasks = [];
      try {
        const stored = safeStorage.getItem(LOCAL_TASKS_KEY);
        if (stored) tasks = JSON.parse(stored);
      } catch (e) {}

      const index = tasks.findIndex(t => t.id === cleanTask.id);
      if (index !== -1) {
        tasks[index] = normalizeTask({
          ...tasks[index],
          ...cleanTask,
          updatedAt: new Date().toISOString()
        });
        safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        return true;
      }
      return false;
    }

    async updateStatus(taskId, newStatus, updatedBy) {
      if (this.isLiveMode()) {
        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'updateStatus',
              taskId: taskId,
              status: newStatus,
              updatedBy: updatedBy
            })
          });
          const json = await response.json();
          if (json.success) return true;
        } catch (err) {
          console.error('Live updateStatus failed:', err);
        }
      }

      let tasks = [];
      try {
        const stored = safeStorage.getItem(LOCAL_TASKS_KEY);
        if (stored) tasks = JSON.parse(stored);
      } catch (e) {}

      const index = tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        tasks[index].status = newStatus;
        tasks[index].updatedAt = new Date().toISOString();
        safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        return true;
      }
      return false;
    }

    async deleteTask(taskId, deletedBy) {
      if (this.isLiveMode()) {
        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'deleteTask',
              taskId: taskId,
              deletedBy: deletedBy
            })
          });
          const json = await response.json();
          if (json.success) return true;
        } catch (err) {
          console.error('Live deleteTask failed:', err);
        }
      }

      let tasks = [];
      try {
        const stored = safeStorage.getItem(LOCAL_TASKS_KEY);
        if (stored) tasks = JSON.parse(stored);
      } catch (e) {}

      tasks = tasks.filter(t => t.id !== taskId);
      safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
      return true;
    }

    /**
     * อัปโหลดไฟล์แนบไปยัง Google Drive (หรือแปลงเป็น Data URI น้ำหนักเบากรณีโหมดจำลอง)
     */
    async uploadFile(file) {
      // 1. ปรับขนาดรูปภาพให้อัตโนมัติ เพื่อความรวดเร็วและประหยัดพื้นที่
      const processedFile = await compressImageIfNeeded(file);

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result;
          
          if (this.isLiveMode()) {
            try {
              const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  action: 'uploadFile',
                  fileData: base64Data,
                  fileName: processedFile.name,
                  mimeType: processedFile.type
                })
              });
              const json = await response.json();
              if (json && json.success) {
                resolve({
                  fileUrl: json.fileUrl,
                  directViewUrl: json.directViewUrl,
                  fileName: json.fileName || processedFile.name,
                  fileType: processedFile.type
                });
                return;
              } else {
                console.warn('Drive upload returned failure, using base64 fallback:', json ? json.error : 'Unknown');
              }
            } catch (err) {
              console.warn('Drive upload fetch error, using base64 fallback:', err);
            }
          }

          // Fallback / Local mode
          resolve({
            fileUrl: base64Data,
            directViewUrl: base64Data,
            fileName: processedFile.name,
            fileType: processedFile.type
          });
        };

        reader.onerror = error => reject(error);
        reader.readAsDataURL(processedFile);
      });
    }

    /**
     * อัปโหลดไฟล์แนบหลายไฟล์พร้อมกัน
     */
    async uploadMultipleFiles(files, progressCallback) {
      if (!files || files.length === 0) return [];
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (progressCallback) progressCallback(i + 1, files.length, file.name);
        try {
          const res = await this.uploadFile(file);
          results.push({
            name: res.fileName,
            url: res.fileUrl,
            directViewUrl: res.directViewUrl || res.fileUrl,
            type: res.fileType
          });
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
        }
      }
      return results;
    }

    resetLocalData() {
      safeStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(INITIAL_MOCK_TASKS));
      safeStorage.setItem(LOCAL_MEMBERS_KEY, JSON.stringify(INITIAL_MEMBERS));
    }
  }

  // ผูกเข้ากับ window เพื่อให้เข้าถึงได้
  window.TodoApi = {
    api: new TodoApi(),
    INITIAL_MEMBERS,
    INITIAL_MOCK_TASKS,
    safeStorage
  };
})();
