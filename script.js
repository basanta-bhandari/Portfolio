let highestZ = 1000;

function bringToFront(winEl) {
  highestZ++;
  winEl.style.zIndex = highestZ;
  updateTaskbar();
}

function updateTaskbar() {
  document.querySelectorAll('.dock-item').forEach(item => {
    const targetId = item.dataset.target;
    const win = document.getElementById(targetId);
    if(win && !win.classList.contains('hidden')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

document.querySelectorAll('.dock-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetId = item.dataset.target;
    const win = document.getElementById(targetId);
    if(win) {
      if(win.classList.contains('hidden')) {
        win.classList.remove('hidden');
      }
      bringToFront(win);
      updateTaskbar();
    }
  });
});

document.querySelectorAll('.desk-icon').forEach(icon => {
  icon.addEventListener('click', () => {
    document.querySelectorAll('.desk-icon').forEach(i => i.classList.remove('selected'));
    icon.classList.add('selected');
  });
  icon.addEventListener('dblclick', () => {
    if(icon.dataset.opens) {
      const win = document.getElementById(icon.dataset.opens);
      if(win) {
        win.classList.remove('hidden');
        bringToFront(win);
        updateTaskbar();
      }
    }
    if(icon.dataset.href) {
      window.open(icon.dataset.href, '_blank');
    }
  });
});

// Window Buttons
document.querySelectorAll('.close').forEach(btn => {
  btn.onclick = () => {
    const win = document.getElementById(btn.dataset.closes);
    if(win) win.classList.add('hidden');
    updateTaskbar();
  };
});

document.querySelectorAll('.maxb').forEach(btn => {
  btn.onclick = () => {
    const win = document.getElementById(btn.dataset.maxs);
    if(win) {
      if(win.dataset.isMaximized === 'true') {
        win.style.top = win.dataset.restoreTop;
        win.style.left = win.dataset.restoreLeft;
        win.style.width = win.dataset.restoreWidth;
        win.style.height = win.dataset.restoreHeight;
        win.dataset.isMaximized = 'false';
      } else {
        win.dataset.restoreTop = win.style.top;
        win.dataset.restoreLeft = win.style.left;
        win.dataset.restoreWidth = win.style.width;
        win.dataset.restoreHeight = win.style.height;
        win.style.top = '0';
        win.style.left = '0';
        win.style.width = '100vw';
        win.style.height = 'calc(100vh - 40px)';
        win.dataset.isMaximized = 'true';
      }
    }
  };
});

document.querySelectorAll('.minb').forEach(btn => {
  btn.onclick = () => {
    const win = document.getElementById(btn.dataset.mins);
    if(win) win.classList.add('hidden');
    updateTaskbar();
  };
});

// Taskbar item clicks
document.querySelectorAll('.task-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetId = item.dataset.target;
    const win = document.getElementById(targetId);
    if(win) {
      if(win.classList.contains('hidden')) {
        win.classList.remove('hidden');
      }
      bringToFront(win);
      updateTaskbar();
    }
  });
});

document.querySelectorAll('.titlebar').forEach(bar => {
  const win = bar.closest('.window');
  
  win.addEventListener('mousedown', () => bringToFront(win));

  bar.addEventListener('mousedown', e => {
    e.preventDefault();
    let offsetX = e.clientX - win.offsetLeft;
    let offsetY = e.clientY - win.offsetTop;

    const doDrag = e2 => {
      win.style.left = (e2.clientX - offsetX) + "px";
      win.style.top = (e2.clientY - offsetY) + "px";
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  });
});

document.querySelectorAll('.resizer').forEach(handle => {
  const win = document.getElementById(handle.dataset.resizes);
  
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(win);
    
    const startWidth = win.offsetWidth;
    const startHeight = win.offsetHeight;
    const startX = e.clientX;
    const startY = e.clientY;

    const doResize = e2 => {
      const newWidth = Math.max(300, startWidth + (e2.clientX - startX));
      const newHeight = Math.max(200, startHeight + (e2.clientY - startY));
      win.style.width = newWidth + 'px';
      win.style.height = newHeight + 'px';
    };

    const stopResize = () => {
      document.removeEventListener('mousemove', doResize);
      document.removeEventListener('mouseup', stopResize);
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  });
});

function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dockTime = document.getElementById('dockTime');
  const statusTime = document.getElementById('statusTime');
  if(dockTime) dockTime.innerText = timeStr;
  if(statusTime) statusTime.innerText = timeStr;
}
setInterval(updateTime, 1000);
updateTime();

if ('getBattery' in navigator) {
  navigator.getBattery().then(function(battery) {
    function updateBattery() {
      const percent = Math.floor(battery.level * 100);
      const dockBattery = document.getElementById('dockBattery');
      const statusBattery = document.getElementById('statusBattery');
      if(dockBattery) dockBattery.innerText = percent + '%';
      if(statusBattery) statusBattery.innerText = percent + '%';
    }
    
    updateBattery();
    battery.addEventListener('levelchange', updateBattery);
    battery.addEventListener('chargingchange', updateBattery);
  });
} 
else {
  const dockBattery = document.getElementById('dockBattery');
  const statusBattery = document.getElementById('statusBattery');
  if(dockBattery) dockBattery.innerText = '100%';
  if(statusBattery) statusBattery.innerText = '100%';
}

updateTaskbar();

const quickfindOverlay = document.getElementById('quickfind-overlay');
const quickfindInput = document.querySelector('.quickfind-input');
let isQuickfindOpen = false;

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'Space') {
    e.preventDefault();
    toggleQuickfind();
  }
  if (e.key === 'Escape' && isQuickfindOpen) {
    toggleQuickfind();
  }
});

function toggleQuickfind() {
  isQuickfindOpen = !isQuickfindOpen;
  if (isQuickfindOpen) {
    quickfindOverlay.classList.add('visible');
    quickfindInput.value = '';
    updateQuickfindSuggestions();
    quickfindInput.focus();
  } else {
    quickfindOverlay.classList.remove('visible');
  }
}

function updateQuickfindSuggestions() {
  const query = quickfindInput.value.trim().toLowerCase();
  const suggestions = document.getElementById('quickfind-suggestions');
  suggestions.innerHTML = '';
  
  if (!query) {
    suggestions.classList.remove('active');
    return;
  }

  const apps = [
    { name: 'Welcome', icon: 'ph-info' },
    { name: 'Projects', icon: 'ph-briefcase' },
    { name: 'Finder', icon: 'ph-folder' },
    { name: 'Editor', icon: 'ph-text-t' },
    { name: 'Settings', icon: 'ph-gear' },
    { name: 'Backgrounds', icon: 'ph-image' },
    { name: 'Skills', icon: 'ph-lightning' },
    { name: 'Experience', icon: 'ph-briefcase' },
    { name: 'Music', icon: 'ph-music-note' }
  ];

  const matches = apps.filter(app => app.name.toLowerCase().includes(query));

  if (matches.length > 0) {
    suggestions.classList.add('active');
    matches.forEach((app, idx) => {
      const el = document.createElement('div');
      el.className = 'suggestion-item';
      el.innerHTML = `<i class="ph ${app.icon}"></i> <span>${app.name}</span>`;
      el.onmousedown = () => {
        openWindowByName(app.name);
        toggleQuickfind();
      };
      suggestions.appendChild(el);
    });
  } else {
    suggestions.classList.remove('active');
  }
}

function openWindowByName(name) {
  const windowMap = {
    'Welcome': 'welcome',
    'Projects': 'projects',
    'Finder': 'finder',
    'Editor': 'texteditor',
    'Settings': 'settings',
    'Backgrounds': 'backgrounds',
    'Skills': 'skills',
    'Experience': 'experience',
    'Music': 'music'
  };
  
  const winId = windowMap[name];
  if (winId) {
    const win = document.getElementById(winId);
    if (win) {
      win.classList.remove('hidden');
      bringToFront(win);
      updateTaskbar();
    }
  }
}

quickfindInput.addEventListener('input', updateQuickfindSuggestions);

const snapAssistBar = document.getElementById('snap-assist-bar');
let isWindowDragging = false;
let activeDropZone = null;

document.querySelectorAll('.titlebar').forEach(bar => {
  const win = bar.closest('.window');
  let startX, startY, initialLeft, initialTop;

  bar.addEventListener('mousedown', (e) => {
    isWindowDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = win.offsetLeft;
    initialTop = win.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isWindowDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      if (e.clientY < 50) {
        snapAssistBar.classList.add('visible');
      } else {
        snapAssistBar.classList.remove('visible');
        if (activeDropZone) {
          activeDropZone.classList.remove('active-drop');
          activeDropZone = null;
        }
      }

      if (snapAssistBar.classList.contains('visible')) {
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        if (activeDropZone && activeDropZone !== elemBelow) {
          activeDropZone.classList.remove('active-drop');
        }
        if (elemBelow && elemBelow.classList.contains('snap-zone')) {
          activeDropZone = elemBelow;
          activeDropZone.classList.add('active-drop');
        }
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isWindowDragging && activeDropZone) {
      snapWindowToZone(win, activeDropZone);
      activeDropZone.classList.remove('active-drop');
      activeDropZone = null;
    }
    isWindowDragging = false;
    snapAssistBar.classList.remove('visible');
  });
});

function snapWindowToZone(win, zone) {
  const snapType = zone.getAttribute('data-snap');
  win.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

  switch(snapType) {
    case 'left':
      win.style.top = '0px';
      win.style.left = '10px';
      win.style.width = 'calc(50% - 15px)';
      win.style.height = '100%';
      break;
    case 'right':
      win.style.top = '0px';
      win.style.left = 'calc(50% + 5px)';
      win.style.width = 'calc(50% - 15px)';
      win.style.height = '100%';
      break;
  }

  setTimeout(() => {
    win.style.transition = '';
  }, 300);
}

const contextMenu = document.querySelector('.context-menu');

function showContextMenu(e, items) {
  e.preventDefault();
  contextMenu.innerHTML = '';
  
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'context-menu-item';
    div.innerHTML = `<i class="ph ${item.icon}"></i> ${item.text}`;
    div.onclick = () => {
      item.action();
      contextMenu.style.display = 'none';
    };
    contextMenu.appendChild(div);
  });

  contextMenu.style.display = 'block';
  let x = e.clientX;
  let y = e.clientY;
  
  if (x + contextMenu.offsetWidth > window.innerWidth) {
    x -= contextMenu.offsetWidth;
  }
  
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
}

document.addEventListener('click', () => {
  if (contextMenu) contextMenu.style.display = 'none';
});

// Desktop right-click
document.getElementById('desktop').addEventListener('contextmenu', (e) => {
  showContextMenu(e, [
    { icon: 'ph-file-plus', text: 'New Folder', action: () => {} },
    { icon: 'ph-arrow-clockwise', text: 'Refresh', action: () => location.reload() }
  ]);
});

class VirtualFileSystem {
  constructor() {
    this.files = JSON.parse(localStorage.getItem('vfs_files')) || {};
    this.createDefaultFolders();
  }

  createDefaultFolders() {
    if (!this.files['/']) this.files['/'] = { type: 'folder', name: 'Home', children: ['Portfolio', 'Apps', 'Documents', 'Downloads'] };
    if (!this.files['/Portfolio']) this.files['/Portfolio'] = { type: 'folder', name: 'Portfolio', children: ['Projects', 'GitHub', 'PyPI', 'Skills', 'Experience'] };
    if (!this.files['/Apps']) this.files['/Apps'] = { type: 'folder', name: 'Apps', children: ['Finder', 'Editor', 'Music'] };
    if (!this.files['/Documents']) this.files['/Documents'] = { type: 'folder', name: 'Documents', children: [] };
    if (!this.files['/Downloads']) this.files['/Downloads'] = { type: 'folder', name: 'Downloads', children: [] };
    
    if (!this.files['/Portfolio/Projects']) this.files['/Portfolio/Projects'] = { type: 'link', name: 'Projects', target: 'projects' };
    if (!this.files['/Portfolio/GitHub']) this.files['/Portfolio/GitHub'] = { type: 'link', name: 'GitHub', target: 'https://github.com/basanta-bhandari' };
    if (!this.files['/Portfolio/PyPI']) this.files['/Portfolio/PyPI'] = { type: 'link', name: 'PyPI', target: 'https://pypi.org/user/basantabh/' };
    if (!this.files['/Portfolio/Skills']) this.files['/Portfolio/Skills'] = { type: 'link', name: 'Skills', target: 'skills' };
    if (!this.files['/Portfolio/Experience']) this.files['/Portfolio/Experience'] = { type: 'link', name: 'Experience', target: 'experience' };
    
    if (!this.files['/Apps/Finder']) this.files['/Apps/Finder'] = { type: 'link', name: 'Finder', target: 'finder' };
    if (!this.files['/Apps/Editor']) this.files['/Apps/Editor'] = { type: 'link', name: 'Editor', target: 'texteditor' };
    if (!this.files['/Apps/Music']) this.files['/Apps/Music'] = { type: 'link', name: 'Music', target: 'music' };
    
    this.save();
  }

  save() {
    localStorage.setItem('vfs_files', JSON.stringify(this.files));
  }

  getStorageUsage() {
    const usage = new Blob(Object.values(this.files)).size;
    return { used: usage, total: 5 * 1024 * 1024 };
  }
}

const vfs = new VirtualFileSystem();

const finderItems = document.getElementById('finderItems');
const finderSearch = document.getElementById('finderSearch');
const newFolderBtn = document.getElementById('newFolderBtn');
const sidebarItems = document.querySelectorAll('.sidebar-item');
let currentPath = '/';

function renderFinderItems(path = '/') {
  finderItems.innerHTML = '';
  const items = vfs.files[path]?.children || [];
  
  if (items.length === 0) {
    finderItems.innerHTML = '<p style="color: rgba(255,255,255,0.4); font-size: 12px; grid-column: 1/-1; text-align: center; padding: 20px;">Empty folder</p>';
    return;
  }

  items.forEach(itemName => {
    const itemPath = path === '/' ? `/${itemName}` : `${path}/${itemName}`;
    const item = vfs.files[itemPath];
    
    if (!item) return;
    
    const div = document.createElement('div');
    div.className = 'finder-item';
    div.innerHTML = `
      <div class="finder-item-icon">${item.type === 'folder' ? '[FOLDER]' : '[FILE]'}</div>
      <div class="finder-item-name">${itemName}</div>
    `;
    
    div.addEventListener('dblclick', () => {
      if (item.type === 'folder') {
        currentPath = itemPath;
        renderFinderItems(itemPath);
        updateSidebarActive(itemPath);
      } else if (item.type === 'link') {
        if (item.target.startsWith('http')) {
          window.open(item.target, '_blank');
        } else {
          const win = document.getElementById(item.target);
          if (win) {
            win.classList.remove('hidden');
            bringToFront(win);
            updateTaskbar();
          }
        }
      }
    });
    
    finderItems.appendChild(div);
  });
}

function updateSidebarActive(path) {
  sidebarItems.forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-path="${path}"]`)?.classList.add('active');
}

sidebarItems.forEach(item => {
  item.addEventListener('click', () => {
    currentPath = item.dataset.path;
    renderFinderItems(currentPath);
    updateSidebarActive(currentPath);
  });
});

newFolderBtn.addEventListener('click', () => {
  const folderName = prompt('Enter folder name:');
  if (folderName) {
    const folderPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    vfs.files[folderPath] = { type: 'folder', name: folderName, children: [] };
    if (vfs.files[currentPath]) {
      vfs.files[currentPath].children = vfs.files[currentPath].children || [];
      if (!vfs.files[currentPath].children.includes(folderName)) {
        vfs.files[currentPath].children.push(folderName);
      }
    }
    vfs.save();
    renderFinderItems(currentPath);
  }
});

finderSearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.finder-item');
  items.forEach(item => {
    const name = item.querySelector('.finder-item-name').textContent.toLowerCase();
    item.style.display = name.includes(query) ? '' : 'none';
  });
});

const editorContent = document.getElementById('editorContent');
const editorFileName = document.getElementById('editorFileName');
const editorSaveBtn = document.getElementById('editorSaveBtn');
const editorNewBtn = document.getElementById('editorNewBtn');
const editorOpenBtn = document.getElementById('editorOpenBtn');
let currentFile = null;

editorSaveBtn.addEventListener('click', () => {
  const fileName = editorFileName.value || 'Untitled.txt';
  const content = editorContent.value;
  
  if (!fileName.endsWith('.txt')) {
    editorFileName.value = fileName + '.txt';
  }
  
  vfs.files[`/Documents/${fileName}`] = { type: 'file', name: fileName, content };
  if (vfs.files['/Documents'].children && !vfs.files['/Documents'].children.includes(fileName)) {
    vfs.files['/Documents'].children.push(fileName);
  }
  vfs.save();
  currentFile = fileName;
  alert(`Saved as "${fileName}" in Documents folder!`);
});

editorNewBtn.addEventListener('click', () => {
  editorContent.value = '';
  editorFileName.value = 'Untitled.txt';
  currentFile = null;
});

editorOpenBtn.addEventListener('click', () => {
  currentPath = '/Documents';
  renderFinderItems(currentPath);
  document.getElementById('finder').classList.remove('hidden');
  bringToFront(document.getElementById('finder'));
});

const themeSelect = document.getElementById('themeSelect');
const storageUsed = document.getElementById('storageUsed');
const storageText = document.getElementById('storageText');

function updateStorageDisplay() {
  const { used, total } = vfs.getStorageUsage();
  const percent = (used / total) * 100;
  storageUsed.style.width = Math.min(percent, 100) + '%';
  storageText.textContent = `Used: ${(used / 1024).toFixed(0)} KB / ${(total / 1024 / 1024).toFixed(0)} MB`;
}

themeSelect.addEventListener('change', (e) => {
  if (e.target.value === 'light') {
    document.body.style.filter = 'invert(1) hue-rotate(180deg)';
  } else {
    document.body.style.filter = '';
  }
  localStorage.setItem('theme', e.target.value);
});

updateStorageDisplay();
setInterval(updateStorageDisplay, 2000);

renderFinderItems('/');

const bgColorPicker = document.getElementById('bgColorPicker');
const bgImageUrl = document.getElementById('bgImageUrl');
const bgApplyBtn = document.getElementById('bgApplyBtn');
const bgResetBtn = document.getElementById('bgResetBtn');
const bgPresets = document.getElementById('bgPresets');
const wallpaper = document.querySelector('.wallpaper');

const defaultBgs = [
  { name: 'Fig', url: './Backgrounds/fig.png' },
  { name: 'Mountain', url: './Backgrounds/mountain.png' },
  { name: 'Default', url: './Backgrounds/default.png' },
  { name: 'Forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&h=600&fit=crop' },
  { name: 'Spirited Away', url: './Backgrounds/Spirited Away Station.png' }
];

defaultBgs.forEach(bg => {
  const div = document.createElement('div');
  div.className = 'bg-preset';
  div.style.backgroundImage = `url('${bg.url}')`;
  div.title = bg.name;
  div.addEventListener('click', () => {
    wallpaper.style.backgroundImage = `url('${bg.url}')`;
    localStorage.setItem('bgImage', bg.url);
  });
  bgPresets.appendChild(div);
});

bgColorPicker.addEventListener('change', (e) => {
  wallpaper.style.backgroundColor = e.target.value;
  wallpaper.style.backgroundImage = 'none';
  localStorage.setItem('bgColor', e.target.value);
});

bgApplyBtn.addEventListener('click', () => {
  const url = bgImageUrl.value.trim();
  if (url) {
    wallpaper.style.backgroundImage = `url('${url}')`;
    localStorage.setItem('bgImage', url);
    bgImageUrl.value = '';
  }
});

bgResetBtn.addEventListener('click', () => {
  wallpaper.style.backgroundImage = "url('./Backgrounds/fig.png')";
  wallpaper.style.background = '';
  localStorage.removeItem('bgImage');
  localStorage.removeItem('bgColor');
});

const savedBg = localStorage.getItem('bgImage');
const savedColor = localStorage.getItem('bgColor');
if (savedBg) {
  wallpaper.style.backgroundImage = `url('${savedBg}')`;
}
if (savedColor) {
  wallpaper.style.background = savedColor;
  bgColorPicker.value = savedColor;
}