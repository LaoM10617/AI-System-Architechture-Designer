function initNotes() {
    // 添加新便签
    addNoteBtn.addEventListener('click', function () {
        noteCount++;
        const x = 100 + (Math.random() * 200);
        const y = 100 + (Math.random() * 200);

        const note = document.createElement('div');
        note.className = 'note';
        note.style.top = `${y}px`;
        note.style.left = `${x}px`;
        note.innerHTML = `
              <div class="note-header">
                <div>
                  <div class="title-edit-tooltip">Double-click to edit title</div>
                  <div class="note-title" tabindex="0">Note #${noteCount}</div>
                </div>
                <div class="note-actions">
                  <div class="note-action suggest-action" title="AI Suggest"><i class="fas fa-magic"></i></div>
                  <div class="note-action"><i class="fas fa-times"></i></div>
                </div>
              </div>
              <div class="note-content" contenteditable="true">
                Double-click to edit this note...
              </div>
            `;

        whiteboard.appendChild(note);
        addNoteEvents(note);
    });

    // 给所有已有便签添加事件
    document.querySelectorAll('.note').forEach(note => {
        addNoteEvents(note);
    });


}

// 便签事件绑定函数
function addNoteEvents(note) {
    // 删除按钮事件和拖拽删除
    const deleteBtn = note.querySelector('.note-action:not(.suggest-action)');
    const suggestBtn = note.querySelector('.suggest-action');
    const title = note.querySelector('.note-title');
    // 删除按钮点击删除
    deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        note.style.transform = 'scale(0.9)';
        note.style.opacity = '0.5';
        setTimeout(() => {
            deletedNotesArr.push({
                html: note.outerHTML,
                top: note.style.top,
                left: note.style.left
            });
            if (whiteboard.contains(note)) {
                whiteboard.removeChild(note);
                deletedNotes++;
                trashCount.textContent = deletedNotes;
                updateTrashList();
            }
        }, 300);
    });
    // 拖拽功能（自定义拖动，便签本身不设置draggable）
    note.removeAttribute('draggable');
    // 允许整个 note 区域拖动
    note.addEventListener('mousedown', function(e) {
        // 避免在编辑内容、点击按钮等时触发拖动
        if (
            e.target.classList.contains('note-action') ||
            (e.target.classList.contains('note-title') && e.target.isContentEditable) ||
            (e.target.classList.contains('note-content') && e.target.isContentEditable)
        ) {
            return;
        }
        startDrag.call(this, e);
    });
    // 删除按钮支持原生拖拽到垃圾桶
    deleteBtn.setAttribute('draggable', 'true');
    deleteBtn.addEventListener('dragstart', function (e) {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', 'delete-note');
        // 记录当前拖拽的 note
        currentNote = note;
        // 拖拽预览
        dragPreview = note.cloneNode(true);
        dragPreview.style.position = 'absolute';
        dragPreview.style.pointerEvents = 'none';
        dragPreview.style.opacity = '0.7';
        dragPreview.style.zIndex = '9999';
        dragPreview.style.left = '-9999px';
        dragPreview.style.top = '-9999px';
        document.body.appendChild(dragPreview);
        e.dataTransfer.setDragImage(dragPreview, 100, 30);
    });
    deleteBtn.addEventListener('dragend', function () {
        if (dragPreview && dragPreview.parentNode) {
            dragPreview.parentNode.removeChild(dragPreview);
            dragPreview = null;
        }
        currentNote = null;
    });

    // AI Suggest button
    if (suggestBtn) {
        suggestBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const titleText = title.textContent.trim() || 'New Note';
            const contentDiv = note.querySelector('.note-content');
            const existingContent = contentDiv.innerText.trim();
            const existingNotes = Array.from(document.querySelectorAll('.note'))
                .filter(n => n !== note)
                .map(el => el.innerText.trim())
                .filter(text => text.length > 0)
                .join('\n\n');

            const original = contentDiv.innerText;
            contentDiv.innerText = '(Generating suggestion from AI...)';

            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div>';
            whiteboard.appendChild(overlay);

            fetch('http://127.0.0.1:8000/api/note_hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ existingNotes, title: titleText, content: existingContent })
            })
                .then(res => res.json())
                .then(data => {
                    if (existingContent) {
                        contentDiv.innerText = existingContent + '\n' + data.suggestion;
                    } else {
                        contentDiv.innerText = data.suggestion;
                    }
                })
                .catch(err => {
                    console.error('AI suggestion failed', err);
                    contentDiv.innerText = original;
                })
                .finally(() => {
                    if (whiteboard.contains(overlay)) {
                        whiteboard.removeChild(overlay);
                    }
                });
        });
    }

    // 标题双击编辑
    title.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        this.contentEditable = true;
        this.focus();

        // 选中全部文本
        const range = document.createRange();
        range.selectNodeContents(this);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });

    title.addEventListener('blur', function () {
        this.contentEditable = false;

        // 标题为空时恢复默认
        if (this.textContent.trim() === '') {
            this.textContent = this.dataset.original || 'Untitled Note';
        }
    });

    // 首次交互时保存原始标题
    if (!title.dataset.original) {
        title.dataset.original = title.textContent;
    }

    // 按回车结束编辑
    title.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });

    // 内容双击可编辑
    const content = note.querySelector('.note-content');
    content.addEventListener('dblclick', function () {
        this.contentEditable = true;
        this.focus();
    });

    content.addEventListener('blur', function () {
        this.contentEditable = false;
    });

    //如果内容为空，由llm提供灵感
    if (content.innerText.trim() === "") {
        content.innerText = "(Generating suggestion from AI...)";
        const existingNotes = Array.from(document.querySelectorAll(".note"))
            .map(el => el.innerText.trim())
            .filter(text => text.length > 0)
            .join("\n\n");

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        whiteboard.appendChild(overlay);

        fetch("http://127.0.0.1:8000/api/note_hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ existingNotes, title: title.textContent.trim(), content: "" })
        })
            .then(res => res.json())
            .then(data => {
                content.innerText = data.suggestion;
            })
            .finally(() => {
                if (whiteboard.contains(overlay)) {
                    whiteboard.removeChild(overlay);
                }
            });
    }

    // 添加右下角resize手柄
    if (!note.querySelector('.resize-handle')) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.right = '2px';
        resizeHandle.style.bottom = '2px';
        resizeHandle.style.width = '16px';
        resizeHandle.style.height = '16px';
        resizeHandle.style.cursor = 'nwse-resize';
        resizeHandle.style.background = 'rgba(0,0,0,0.08)';
        resizeHandle.style.borderRadius = '4px';
        resizeHandle.style.zIndex = '20';
        note.appendChild(resizeHandle);

        let resizing = false;
        let startX, startY, startW, startH;
        resizeHandle.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            resizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = note.offsetWidth;
            startH = note.offsetHeight;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', function(e) {
            if (!resizing) return;
            const minW = 180, minH = 80;
            let newW = Math.max(minW, startW + (e.clientX - startX));
            let newH = Math.max(minH, startH + (e.clientY - startY));
            note.style.width = newW + 'px';
            note.style.height = newH + 'px';
        });
        document.addEventListener('mouseup', function() {
            if (resizing) {
                resizing = false;
                document.body.style.userSelect = '';
            }
        });
    }
    // 在addNoteEvents内，给note设置负的marginTop，使其能拖到whiteboard最上方
    const paddingTop = parseInt(window.getComputedStyle(whiteboard).paddingTop, 10) || 0;
    note.style.marginTop = `-${paddingTop}px`;
}

// 在 addNoteEvents 外部定义
let dragStartX, dragStartY, noteStartLeft, noteStartTop;

// 拖拽开始
function startDrag(e) {
    if (
        e.target.classList.contains('note-action') ||
        (e.target.classList.contains('note-title') && e.target.isContentEditable) ||
        (e.target.classList.contains('note-content') && e.target.isContentEditable)
    ) {
        return;
    }
    isDragging = true;
    currentNote = this;
    // 记录鼠标初始位置
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    // 记录 note 当前的 left/top 数值（去掉 px）
    noteStartLeft = parseInt(currentNote.style.left, 10) || 0;
    noteStartTop = parseInt(currentNote.style.top, 10) || 0;

    currentNote.style.zIndex = '100';
    document.addEventListener('mousemove', dragNote);
    document.addEventListener('mouseup', stopDrag);
}

// 拖拽中
function dragNote(e) {
    if (!isDragging) return;
    const whiteboardRect = whiteboard.getBoundingClientRect();
    // 鼠标移动的差值
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    // 新位置
    let newLeft = noteStartLeft + dx;
    let newTop = noteStartTop + dy;
    // 边界检查
    const maxX = whiteboard.offsetWidth - currentNote.offsetWidth;
    const maxY = whiteboard.offsetHeight - currentNote.offsetHeight;
    const minY = 0;
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(minY, Math.min(newTop, maxY));
    currentNote.style.left = `${newLeft}px`;
    currentNote.style.top = `${newTop}px`;
}

// 拖拽结束
function stopDrag() {
    isDragging = false;
    if (currentNote) {
        currentNote.style.zIndex = '10';
        currentNote = null;
    }
    document.removeEventListener('mousemove', dragNote);
    document.removeEventListener('mouseup', stopDrag);
}

window.initNotes = initNotes;


