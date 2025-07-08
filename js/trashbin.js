function initTrashBin() { 
// Debugging: Confirm elements exist
console.log('Elements:', { bins, trashBin, docBin });

bins.addEventListener('click', function () {
    const binsIcon = this.querySelector('i');
    binsVisible = !binsVisible;

    if (binsVisible) {
        trashBin.classList.remove('hidden');
        docBin.classList.remove('hidden');
    } else {
        trashBin.classList.add('hidden');
        docBin.classList.add('hidden');
    }

    // Toggle icon
    binsIcon.classList.toggle('fa-eye');
    binsIcon.classList.toggle('fa-eye-slash');
});

// 垃圾桶点击事件
trashBin.addEventListener('click', function () {
    // 不再弹窗
});

// 垃圾桶拖拽恢复功能
trashBin.setAttribute('draggable', 'true');

trashBin.addEventListener('dragstart', function (e) {
    if (deletedNotesArr.length === 0) return;
    const last = deletedNotesArr[deletedNotesArr.length - 1];
    e.dataTransfer.setData('text/plain', 'restore-note');
    // 拖拽预览节点
    dragPreview = document.createElement('div');
    dragPreview.innerHTML = last.html;
    dragPreview.style.position = 'absolute';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.opacity = '0.7';
    dragPreview.style.zIndex = '9999';
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 100, 30);
});

trashBin.addEventListener('dragend', function () {
    if (dragPreview && dragPreview.parentNode) {
        dragPreview.parentNode.removeChild(dragPreview);
        dragPreview = null;
    }
});

// 点击垃圾桶切换显示/隐藏
trashBin.addEventListener('click', function (e) {
    if (deletedNotesArr.length === 0) return;
    trashListVisible = !trashListVisible;
    trashList.style.display = trashListVisible ? 'block' : 'none';
    e.stopPropagation();
});

// 点击页面其他地方关闭
window.addEventListener('click', function () {
    if (trashListVisible) {
        trashList.style.display = 'none';
        trashListVisible = false;
    }
});

// 阻止点击 list 区域冒泡，避免误关闭
trashList.addEventListener('click', function (e) {
    e.stopPropagation();
});

// 更新回收箱列表
function updateTrashList() {
    trashList.innerHTML = '';

    // 重新添加头部和清空按钮
    const header = document.createElement('div');
    header.className = 'trash-header';
    header.innerHTML = `
                    <span style="font-weight:bold; color:#333;">Deleted Notes</span>
                    <button id="clearTrashBtn">Clear All</button>
                `;
    trashList.appendChild(header);

    // 添加清空按钮事件
    const clearBtn = header.querySelector('#clearTrashBtn');
    clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (deletedNotesArr.length > 0) {
            if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
                deletedNotesArr = [];
                deletedNotes = 0;
                trashCount.textContent = '0';
                updateTrashList();
                trashList.style.display = 'none';
                trashListVisible = false;
            }
        }
    });

    if (deletedNotesArr.length === 0) {
        // 空状态提示
        const emptyMsg = document.createElement('div');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#888';
        emptyMsg.style.fontSize = '13px';
        emptyMsg.style.padding = '8px 20px';
        emptyMsg.style.borderBottom = '1px solid #eee';
        emptyMsg.textContent = 'No deleted notes yet.';
        trashList.appendChild(emptyMsg);
        // 1秒后自动关闭
        setTimeout(() => {
            trashList.style.display = 'none';
            trashListVisible = false;
        }, 1000);
        // 同步计数
        trashCount.textContent = '0';
        return;
    }
    deletedNotesArr.forEach((item, idx) => {
        // 提取标题
        let temp = document.createElement('div');
        temp.innerHTML = item.html;
        let title = temp.querySelector('.note-title')?.textContent || 'Untitled';
        // 创建列表项
        const li = document.createElement('div');
        li.className = 'trash-list-item';
        li.setAttribute('draggable', 'true');
        li.innerHTML = `
                        <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-all;display:inline-block;vertical-align:middle;">${title}</span>
                        <div style="display:flex; gap:5px;">
                            <button class="restore-btn" data-idx="${idx}"><i class='fas fa-undo' style='font-size:14px;color:#fff;'></i></button>
                            <button class="delete-btn" data-idx="${idx}"><i class='fas fa-trash' style='font-size:14px;color:#fff;'></i></button>
                        </div>
                    `;
        // 拖拽恢复
        li.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', idx);
            // 拖拽预览
            dragPreview = document.createElement('div');
            dragPreview.innerHTML = item.html;
            dragPreview.style.position = 'absolute';
            dragPreview.style.pointerEvents = 'none';
            dragPreview.style.opacity = '0.7';
            dragPreview.style.zIndex = '9999';
            document.body.appendChild(dragPreview);
            e.dataTransfer.setDragImage(dragPreview, 100, 30);
        });
        li.addEventListener('dragend', function () {
            if (dragPreview && dragPreview.parentNode) {
                dragPreview.parentNode.removeChild(dragPreview);
                dragPreview = null;
            }
        });
        // 点击恢复
        li.querySelector('.restore-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            restoreNote(idx, null, null);
        });
        // 点击永久删除
        li.querySelector('.delete-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            const idxToDelete = parseInt(this.dataset.idx);
            if (confirm('Are you sure you want to permanently delete this note?')) {
                deletedNotesArr.splice(idxToDelete, 1);
                deletedNotes--;
                trashCount.textContent = deletedNotes;
                updateTrashList();
                // 如果回收箱已空，自动关闭弹窗
                if (deletedNotesArr.length === 0 && trashListVisible) {
                    setTimeout(() => {
                        trashList.style.display = 'none';
                        trashListVisible = false;
                    }, 400);
                }
            }
        });
        trashList.appendChild(li);
    });
}

// 恢复便签函数
function restoreNote(idx, x, y) {
    const item = deletedNotesArr.splice(idx, 1)[0];
    const temp = document.createElement('div');
    temp.innerHTML = item.html;
    const restoredNote = temp.firstElementChild;
    // 定位
    if (x !== null && y !== null) {
        const whiteboardRect = whiteboard.getBoundingClientRect();
        // 直接让便签左上角对齐鼠标指针
        restoredNote.style.left = (x - whiteboardRect.left) + 'px';
        restoredNote.style.top = (y - whiteboardRect.top) + 'px';
    } else {
        restoredNote.style.left = item.left;
        restoredNote.style.top = item.top;
    }
    restoredNote.style.transform = '';
    restoredNote.style.opacity = '1';
    whiteboard.appendChild(restoredNote);
    addNoteEvents(restoredNote);
    deletedNotes--;
    trashCount.textContent = deletedNotes;
    updateTrashList();
    // 如果回收箱已空，自动关闭弹窗
    if (deletedNotesArr.length === 0 && trashListVisible) {
        setTimeout(() => {
            trashList.style.display = 'none';
            trashListVisible = false;
        }, 400);
    }
}

// 拖拽恢复（支持从 trash-list 拖拽）
whiteboard.addEventListener('dragover', function (e) {
    if (deletedNotesArr.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
});
whiteboard.addEventListener('drop', function (e) {
    if (deletedNotesArr.length === 0) return;
    e.preventDefault();
    let idx = e.dataTransfer.getData('text/plain');
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= deletedNotesArr.length) return;
    restoreNote(idx, e.clientX, e.clientY);
});

// 垃圾桶支持拖拽删除
trashBin.addEventListener('dragover', function (e) {
    // 允许拖入
    if (currentNote) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
});

trashBin.addEventListener('drop', function (e) {
    if (currentNote && whiteboard.contains(currentNote)) {
        e.preventDefault();
        // 删除动画
        const noteToDelete = currentNote;
        currentNote = null; // 立即清空，防止多次触发
        noteToDelete.style.transform = 'scale(0.9)';
        noteToDelete.style.opacity = '0.5';
        setTimeout(() => {
            // 再次判断节点有效性
            if (noteToDelete && whiteboard.contains(noteToDelete)) {
                deletedNotesArr.push({
                    html: noteToDelete.outerHTML,
                    top: noteToDelete.style.top,
                    left: noteToDelete.style.left
                });
                whiteboard.removeChild(noteToDelete);
                deletedNotes++;
                trashCount.textContent = deletedNotes;
                updateTrashList();
            }
        }, 200);
    }
});
}

window.initTrashBin = initTrashBin;

