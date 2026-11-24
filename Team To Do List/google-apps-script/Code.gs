/**
 * =========================================================================
 * TEAM TO DO LIST - GOOGLE APPS SCRIPT BACKEND
 * =========================================================================
 * สคริปต์นี้ทำหน้าที่เป็น Web API สำหรับบันทึก/อ่านข้อมูลงานใน Google Sheets
 * และอัปโหลดไฟล์แนบไปยัง Google Drive โดยอัตโนมัติ
 * 
 * วิธีการติดตั้ง:
 * 1. เปิด Google Sheets ใหม่ (https://sheets.new)
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. ลบโค้ดเดิมออกทั้งหมด แล้วนำโค้ดในไฟล์นี้ไปวางแทนที่
 * 4. กดบันทึก (ไอคอนแผ่นดิสก์)
 * 5. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) > "การทำให้ใช้งานได้ใหม่" (New deployment)
 * 6. เลือกประเภท: "เว็บแอป" (Web app)
 * 7. ตั้งค่า:
 *    - คำอธิบาย: Team To Do List API
 *    - ดำเนินการในฐานะ (Execute as): ตัวฉัน (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): ทุกคน (Anyone)
 * 8. กด "ทำให้ใช้งานได้" (Deploy) แล้วคัดลอก URL ของเว็บแอป (Web app URL) ไปใส่ในระบบหน้าเว็บ
 * =========================================================================
 */

// ชื่อแผ่นงานใน Google Sheets
const SHEET_TASKS = 'Tasks';
const SHEET_MEMBERS = 'Members';
const DRIVE_FOLDER_NAME = 'TeamToDo_Attachments';

// รายชื่อสมาชิกเริ่มต้น
const DEFAULT_MEMBERS = [
  { id: 'm1', name: 'คุณ นาวิน บุญสุวรรณ', role: 'manager', avatarColor: '#2563EB' },
  { id: 'm2', name: 'คุณ กมลญาณี เฉลยพงษ์', role: 'member', avatarColor: '#EC4899' },
  { id: 'm3', name: 'คุณ ภัสสร อยู่ป้อม', role: 'member', avatarColor: '#10B981' },
  { id: 'm4', name: 'คุณ กลรัตน์ สกุลมา', role: 'member', avatarColor: '#F59E0B' },
  { id: 'm5', name: 'คุณ นัทธมน รอดแสวง', role: 'member', avatarColor: '#8B5CF6' }
];

/**
 * ฟังก์ชันเริ่มต้นสร้าง Sheet และข้อมูลตัวอย่างอัตโนมัติ
 */
function setupInitialSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ตรวจสอบ/สร้าง Sheet Members
  let membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!membersSheet) {
    membersSheet = ss.insertSheet(SHEET_MEMBERS);
    const headers = ['ID', 'Name', 'Role', 'AvatarColor'];
    membersSheet.appendRow(headers);
    membersSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E2E8F0');
    
    DEFAULT_MEMBERS.forEach(m => {
      membersSheet.appendRow([m.id, m.name, m.role, m.avatarColor]);
    });
  }
  
  // 2. ตรวจสอบ/สร้าง Sheet Tasks
  let tasksSheet = ss.getSheetByName(SHEET_TASKS);
  if (!tasksSheet) {
    tasksSheet = ss.insertSheet(SHEET_TASKS);
    const headers = [
      'ID', 'Title', 'Description', 'Assignee', 'CreatedBy',
      'StartDate', 'Deadline', 'Status', 'Priority',
      'FileUrl', 'FileName', 'FileType', 'CreatedAt', 'UpdatedAt'
    ];
    tasksSheet.appendRow(headers);
    tasksSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E2E8F0');
    
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    
    tasksSheet.appendRow([
      'task_' + Date.now(),
      'จัดเตรียมรายงานสรุปประจำเดือน',
      'รวบรวมตัวเลขผลการปฏิบัติงานของไตรมาสล่าสุดเพื่อนำเสนอหัวหน้างาน',
      'คุณ กมลญาณี เฉลยพงษ์',
      'คุณ นาวิน บุญสุวรรณ',
      today,
      nextWeek,
      'In Progress',
      'Medium',
      '',
      '',
      '',
      new Date().toISOString(),
      new Date().toISOString()
    ]);
  }
}

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  try {
    setupInitialSheets();
    const action = e && e.parameter ? e.parameter.action : 'getAll';
    
    if (action === 'getMembers') {
      return responseJSON({ success: true, data: getMembersData() });
    } else if (action === 'getTasks') {
      return responseJSON({ success: true, data: getTasksData() });
    } else {
      return responseJSON({
        success: true,
        data: {
          members: getMembersData(),
          tasks: getTasksData()
        }
      });
    }
  } catch (error) {
    return responseJSON({ success: false, error: error.toString() });
  }
}

/**
 * Handle HTTP POST Requests
 */
function doPost(e) {
  try {
    setupInitialSheets();
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ success: false, message: 'No payload received' });
    }
    
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    
    let result = { success: false, message: 'Invalid action' };
    
    switch (action) {
      case 'createTask':
        result = createTask(postData.task);
        break;
      case 'updateTask':
        result = updateTask(postData.task);
        break;
      case 'updateStatus':
        result = updateTaskStatus(postData.taskId, postData.status, postData.updatedBy);
        break;
      case 'deleteTask':
        result = deleteTask(postData.taskId, postData.deletedBy);
        break;
      case 'uploadFile':
        result = uploadAttachmentToDrive(postData.fileData, postData.fileName, postData.mimeType);
        break;
      default:
        result = { success: false, message: 'Action not supported: ' + action };
    }
    
    return responseJSON(result);
  } catch (error) {
    return responseJSON({ success: false, error: error.toString() });
  }
}

// -------------------------------------------------------------------------
// Helper Data Functions
// -------------------------------------------------------------------------

function getMembersData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return DEFAULT_MEMBERS;
  
  const members = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[1]) {
      members.push({
        id: r[0] || 'm' + i,
        name: r[1],
        role: r[2] || 'member',
        avatarColor: r[3] || '#2563EB'
      });
    }
  }
  return members;
}

function getTasksData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  const tasks = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0]) {
      tasks.push({
        id: String(r[0]),
        title: r[1] || '',
        description: r[2] || '',
        assignee: r[3] || '',
        createdBy: r[4] || '',
        startDate: formatSheetDate(r[5]),
        deadline: formatSheetDate(r[6]),
        status: r[7] || 'To Do',
        priority: r[8] || 'Normal',
        fileUrl: r[9] || '',
        fileName: r[10] || '',
        fileType: r[11] || '',
        createdAt: r[12] ? String(r[12]) : '',
        updatedAt: r[13] ? String(r[13]) : ''
      });
    }
  }
  return tasks;
}

function formatSheetDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

function createTask(task) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  
  const id = 'task_' + Date.now();
  const now = new Date().toISOString();
  
  // Truncate fileUrl if excessively large to avoid Sheet cell limit (50,000 chars)
  let safeFileUrl = task.fileUrl || '';
  if (safeFileUrl.length > 45000) {
    safeFileUrl = safeFileUrl.substring(0, 45000);
  }

  sheet.appendRow([
    id,
    task.title || 'ไม่มีชื่องาน',
    task.description || '',
    task.assignee || '',
    task.createdBy || '',
    task.startDate || '',
    task.deadline || '',
    task.status || 'To Do',
    task.priority || 'Normal',
    safeFileUrl,
    task.fileName || '',
    task.fileType || '',
    now,
    now
  ]);
  
  return {
    success: true,
    data: Object.assign({}, task, { id: id, createdAt: now, updatedAt: now })
  };
}

function updateTask(task) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(task.id)) {
      const rowIdx = i + 1;
      const now = new Date().toISOString();
      
      sheet.getRange(rowIdx, 2).setValue(task.title || '');
      sheet.getRange(rowIdx, 3).setValue(task.description || '');
      sheet.getRange(rowIdx, 4).setValue(task.assignee || '');
      sheet.getRange(rowIdx, 6).setValue(task.startDate || '');
      sheet.getRange(rowIdx, 7).setValue(task.deadline || '');
      sheet.getRange(rowIdx, 8).setValue(task.status || 'To Do');
      sheet.getRange(rowIdx, 9).setValue(task.priority || 'Normal');
      
      if (task.fileUrl !== undefined) {
        let safeFileUrl = task.fileUrl || '';
        if (safeFileUrl.length > 45000) safeFileUrl = safeFileUrl.substring(0, 45000);
        sheet.getRange(rowIdx, 10).setValue(safeFileUrl);
      }
      if (task.fileName !== undefined) sheet.getRange(rowIdx, 11).setValue(task.fileName || '');
      if (task.fileType !== undefined) sheet.getRange(rowIdx, 12).setValue(task.fileType || '');
      sheet.getRange(rowIdx, 14).setValue(now);
      
      return { success: true, message: 'Updated successfully' };
    }
  }
  return { success: false, message: 'Task not found: ' + task.id };
}

function updateTaskStatus(taskId, status, updatedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(taskId)) {
      const rowIdx = i + 1;
      sheet.getRange(rowIdx, 8).setValue(status);
      sheet.getRange(rowIdx, 14).setValue(new Date().toISOString());
      return { success: true, message: 'Status updated to ' + status };
    }
  }
  return { success: false, message: 'Task not found: ' + taskId };
}

function deleteTask(taskId, deletedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TASKS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(taskId)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Deleted task successfully' };
    }
  }
  return { success: false, message: 'Task not found: ' + taskId };
}

/**
 * Uploads file to Google Drive and sets appropriate access permissions
 */
function uploadAttachmentToDrive(fileBase64, fileName, mimeType) {
  try {
    if (!fileBase64) {
      return { success: false, error: 'No file data received' };
    }

    // 1. ค้นหาหรือสร้างโฟลเดอร์ใน Google Drive
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
    }
    
    // 2. แปลง Base64 เป็นไฟล์
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const safeMime = mimeType || 'application/octet-stream';
    const safeName = fileName || ('file_' + Date.now());
    const blob = Utilities.newBlob(decodedBytes, safeMime, safeName);
    
    // 3. บันทึกลง Drive
    const file = folder.createFile(blob);
    
    // 4. พยายามตั้งค่าสิทธิ์ให้เข้าถึงได้ (พร้อมรับมือกรณี Workspace บล็อกการแชร์สาธารณะ)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      try {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (domainErr) {
        console.warn('Set sharing failed, keeping default permission: ' + domainErr.toString());
      }
    }
    
    const fileId = file.getId();
    // URL ที่ใช้แสดงรูปภาพพรีวิวบนเว็บ (ใช้ lh3.googleusercontent.com เพื่อรองรับการแสดงผลบนเว็บ)
    const fileUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
    const directViewUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    
    return {
      success: true,
      fileUrl: fileUrl,
      directViewUrl: directViewUrl,
      fileId: fileId,
      fileName: safeName
    };
  } catch (err) {
    return {
      success: false,
      error: 'Drive upload error: ' + err.toString()
    };
  }
}

/**
 * ส่งออกผลลัพธ์เป็น JSON
 */
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
