// 初始化Mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    flowchart: {
        useMaxWidth: true,
        htmlLabels: true
    }
});

// =========================
// 便签与白板功能脚本
// =========================
document.addEventListener('DOMContentLoaded', function () {
    const whiteboard = document.getElementById('whiteboard');
    const addNoteBtn = document.getElementById('addNoteBtn');
    const generateBtn = document.getElementById('generateBtn');
    const generateDiagramBtn = document.getElementById('generateDiagramBtn');
    const trashBin = document.getElementById('trashBin');
    const resultNote = document.getElementById('resultNote');
    const trashCount = document.querySelector('.trash-count');
    const trashList = trashBin.querySelector('.trash-list');
    const docBin = document.getElementById('docBin');
    const docCount = document.querySelector('.doc-count');
    const docList = docBin.querySelector('.doc-list');
    const bins = document.getElementById('bins');
    let noteCount = 3;
    let deletedNotes = 0;
    let savedNotesArr = []; // 用于保存保存的草稿便签内容
    let isDragging = false;
    let currentNote = null;
    let offsetX, offsetY;
    let deletedNotesArr = [];
    let dragPreview = null;
    let trashListVisible = false;
    let diagramHistory = [];
    let diagramNoteRef = null;
    let binsVisible = true;
    let favoritesArr = [];

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

    // 生成架构按钮事件
    generateBtn.addEventListener('click', async function () {
        // 显示加载遮罩
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        whiteboard.appendChild(overlay);

        // 收集参数
        const appType = document.getElementById('appType').value;
        const userCount = document.getElementById('userCount').value;
        const projectDesc = document.getElementById('projectDesc').value;
        // 收集功能
        const features = [];
        for (let i = 1; i <= 8; i++) {
            if (document.getElementById('feature' + i).checked) {
                features.push(document.querySelector('label[for="feature' + i + '"]').textContent);
            }
        }
        //收集便签内容
        const notes = Array.from(document.querySelectorAll(".note"))
            .map(note => note.innerText.trim())
            .filter(text => text !== "");

        // 检查 resultNote 是否还在白板上，不在则重新创建
        let resultNote = document.getElementById('resultNote');
        if (!resultNote || !whiteboard.contains(resultNote)) {
            resultNote = document.createElement('div');
            resultNote.className = 'note result-note';
            resultNote.id = 'resultNote';
            resultNote.style.top = '350px';
            resultNote.style.left = '300px';
            resultNote.style.display = 'none';
            resultNote.innerHTML = `
                        <div class="note-header">
                            <div>
                                <div class="title-edit-tooltip">Double-click to edit title</div>
                                <div class="note-title" tabindex="0">AI Architecture Proposal</div>
                            </div>
                            <div class="note-actions">
                                <div class="note-action"><i class="fas fa-times"></i></div>
                            </div>
                        </div>
                        <div class="note-content"></div>
                    `;
            whiteboard.appendChild(resultNote);
        }

        try {
            const response = await fetch('http://127.0.0.1:8000/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: projectDesc,
                    appType: appType,
                    features: features,
                    userCount: userCount,
                    notes: notes
                })
            });
            const data = await response.json();
            whiteboard.removeChild(overlay);
            resultNote.style.display = 'block';
            resultNote.querySelector('.note-content').innerText = data.result || 'No result.';
            resultNote.scrollIntoView({ behavior: 'smooth', block: 'center' });
            addNoteEvents(resultNote);
        } catch (err) {
            whiteboard.removeChild(overlay);
            alert('架构生成服务连接失败，请确认后端服务已启动并允许本地访问。');
            console.error('生成架构请求失败:', err);
        }
    });

    // 修改生成 diagram 逻辑

    generateDiagramBtn.addEventListener('click', async function () {
        console.log('Generate Diagram button clicked!'); // 调试信息

        // 检查是否已经填写了必要的表单信息
        const appType = document.getElementById('appType').value;
        const userCount = document.getElementById('userCount').value;
        const projectDesc = document.getElementById('projectDesc').value;

        console.log('Form values:', { appType, userCount, projectDesc }); // 调试信息

        if (!appType || !userCount || !projectDesc.trim()) {
            alert('请先填写应用类型、用户数量和项目描述，然后再生成图表');
            return;
        }

        // 收集选中的功能 - 修复选择器
        const features = [];
        for (let i = 1; i <= 8; i++) {
            if (document.getElementById('feature' + i).checked) {
                features.push(document.querySelector('label[for="feature' + i + '"]').textContent);
            }
        }

        console.log('Selected features:', features); // 调试信息

        // 显示加载动画
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        whiteboard.appendChild(overlay);

        try {
            console.log('Sending request to backend...'); // 调试信息
            const notes = [];
            // 可选：收集便签内容，和架构生成保持一致
            // const notes = Array.from(document.querySelectorAll(".note"))
            //     .map(note => note.innerText.trim())
            //     .filter(text => text !== "");
            const response = await fetch('http://127.0.0.1:8000/generate_diagram', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: projectDesc,
                    appType: appType,
                    features: features,
                    userCount: userCount,
                    notes: notes // 新增notes字段，后端必需
                })
            });

            const data = await response.json();
            console.log('Response received:', data); // 调试信息

            // 移除加载动画
            whiteboard.removeChild(overlay);

            // 移除之前的 diagram 便利贴
            if (diagramNoteRef && whiteboard.contains(diagramNoteRef)) {
                whiteboard.removeChild(diagramNoteRef);
                diagramNoteRef = null;
            }

            // 创建一个新的Note显示图示文本，包含切换按钮
            const diagramNote = document.createElement('div');
            diagramNote.className = 'note result-note';
            diagramNote.style.top = '500px';
            diagramNote.style.left = '400px';
            diagramNote.style.minWidth = '350px';
            diagramNote.style.maxWidth = '500px';
            diagramNote.innerHTML = `
                      <div class="note-header">
                          <div>
                              <div class="title-edit-tooltip">Double-click to edit title</div>
                              <div class="note-title" tabindex="0">Generated Diagram</div>
                          </div>
                          <div class="note-actions">
                              <div class="note-action"><i class="fas fa-times"></i></div>
                          </div>
                      </div>
                      <div class="note-content">
                          <div class="code-container">
                              <pre style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin: 0; padding: 10px; background: #f8f9fa; border-radius: 5px; max-height: 300px; overflow: auto;">${data.diagram}</pre>
                          </div>
                          <div class="mermaid-container" id="mermaidContainer">
                              <!-- Mermaid图表将在这里渲染 -->
                          </div>
                          <button class="toggle-view-btn" id="toggleViewBtn">
                              <i class="fas fa-eye"></i> View Diagram
                          </button>
                          <button class="favorite-btn-in-footer" title="收藏"><i class="far fa-star"></i></button>
                          <div id="diagramActions" style="margin-top:10px; text-align:center;"></div>
                      </div>
                    `;
            whiteboard.appendChild(diagramNote);
            addNoteEvents(diagramNote);
            diagramNoteRef = diagramNote;

            // 添加切换按钮事件
            const toggleBtn = diagramNote.querySelector('#toggleViewBtn');
            const codeContainer = diagramNote.querySelector('.code-container');
            const mermaidContainer = diagramNote.querySelector('#mermaidContainer');

            toggleBtn.addEventListener('click', function () {
                if (mermaidContainer.classList.contains('show')) {
                    // 切换到代码视图
                    mermaidContainer.classList.remove('show');
                    codeContainer.classList.remove('hide');
                    toggleBtn.innerHTML = '<i class="fas fa-eye"></i> View Diagram';
                    toggleBtn.classList.remove('active');
                } else {
                    // 切换到图表视图
                    codeContainer.classList.add('hide');
                    mermaidContainer.classList.add('show');
                    toggleBtn.innerHTML = '<i class="fas fa-code"></i> View Code';
                    toggleBtn.classList.add('active');

                    // 渲染Mermaid图表
                    if (!mermaidContainer.querySelector('.mermaid')) {
                        const mermaidDiv = document.createElement('div');
                        mermaidDiv.className = 'mermaid';
                        mermaidDiv.textContent = data.diagram;
                        mermaidContainer.appendChild(mermaidDiv);

                        // 初始化Mermaid
                        mermaid.initialize({
                            startOnLoad: true,
                            theme: 'default',
                            flowchart: {
                                useMaxWidth: true,
                                htmlLabels: true
                            }
                        });
                        mermaid.init(undefined, mermaidDiv);

                        // 放大功能
                        mermaidDiv.addEventListener('click', function () {
                            const svg = mermaidDiv.querySelector('svg');
                            if (!svg) return;
                            const overlay = document.createElement('div');
                            overlay.style.position = 'fixed';
                            overlay.style.top = 0;
                            overlay.style.left = 0;
                            overlay.style.width = '100vw';
                            overlay.style.height = '100vh';
                            overlay.style.background = 'rgba(0,0,0,0.7)';
                            overlay.style.zIndex = 9999;
                            overlay.style.display = 'flex';
                            overlay.style.alignItems = 'center';
                            overlay.style.justifyContent = 'center';
                            overlay.style.cursor = 'zoom-out';
                            // 克隆svg
                            const bigSvg = svg.cloneNode(true);
                            bigSvg.style.background = '#fff';
                            bigSvg.style.maxWidth = '90vw';
                            bigSvg.style.maxHeight = '90vh';
                            bigSvg.style.boxShadow = '0 8px 40px rgba(0,0,0,0.5)';
                            overlay.appendChild(bigSvg);
                            overlay.addEventListener('click', function () {
                                document.body.removeChild(overlay);
                            });
                            document.body.appendChild(overlay);
                        });

                        // 下载功能
                        setTimeout(() => {
                            const svg = mermaidDiv.querySelector('svg');
                            if (svg) {
                                const serializer = new XMLSerializer();
                                const svgStr = serializer.serializeToString(svg);
                                const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                                const url = URL.createObjectURL(blob);
                                const actionsDiv = diagramNote.querySelector('#diagramActions');
                                actionsDiv.innerHTML = `<a href="${url}" download="diagram.svg" style="display:inline-block;padding:6px 16px;background:#2196f3;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">download SVG</a>`;
                            }
                        }, 500);
                    }
                }
            });

            // 保存到历史
            diagramHistory.push({ content: data.diagram });

            // 如果API返回了架构描述，更新结果便签
            if (data.architecture) {
                const resultNote = document.getElementById('resultNote');
                if (resultNote) {
                    const resultContent = resultNote.querySelector('.note-content');
                    if (resultContent) {
                        resultContent.textContent = data.architecture;
                    }
                }
            }
        } catch (err) {
            console.error('Error in generateDiagramBtn:', err); // 调试信息
            whiteboard.removeChild(overlay);
            alert('流程图生成服务连接失败，请确认后端服务已启动并允许本地访问。');
            console.error('生成流程图请求失败:', err);
        }
    });

    // 给所有已有便签添加事件
    document.querySelectorAll('.note').forEach(note => {
        addNoteEvents(note);
    });

    // 便签事件绑定函数
    function addNoteEvents(note) {
        // 删除按钮事件和拖拽删除
        const deleteBtn = note.querySelector('.note-action');
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
        note.addEventListener('mousedown', startDrag);
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

        // 标题双击编辑
        const title = note.querySelector('.note-title');
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

            fetch("/api/note_hint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ existingNotes, title })
            })
                .then(res => res.json())
                .then(data => {
                    noteElement.querySelector(".note-content").innerText = data.suggestion;
                });
        }
    }
    // 拖拽开始
    function startDrag(e) {
        // 删除按钮、标题或内容正在编辑时不触发拖拽
        if (
            e.target.classList.contains('note-action') ||
            (e.target.classList.contains('note-title') && e.target.isContentEditable) ||
            (e.target.classList.contains('note-content') && e.target.isContentEditable)
        ) {
            return;
        }
        isDragging = true;
        currentNote = this; // 绑定到整个note
        offsetX = e.clientX - currentNote.getBoundingClientRect().left;
        offsetY = e.clientY - currentNote.getBoundingClientRect().top;

        currentNote.style.zIndex = '100';
        document.addEventListener('mousemove', dragNote);
        document.addEventListener('mouseup', stopDrag);
    }

    // 拖拽中
    function dragNote(e) {
        if (!isDragging) return;

        const whiteboardRect = whiteboard.getBoundingClientRect();
        const x = e.clientX - offsetX - whiteboardRect.left;
        const y = e.clientY - offsetY - whiteboardRect.top;

        // 边界检查
        const maxX = whiteboardRect.width - currentNote.offsetWidth;
        const maxY = whiteboardRect.height - currentNote.offsetHeight;

        currentNote.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        currentNote.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
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

    // 在DOMContentLoaded事件内添加事件委托，监听白板区域所有.favorite-btn-in-footer点击
    whiteboard.addEventListener('click', function (e) {
        const btn = e.target.closest('.favorite-btn-in-footer');
        if (btn) {
            const icon = btn.querySelector('i');
            const note = btn.closest('.result-note');
            // 获取类型和标题
            let type = 'architecture';
            if (note && note.querySelector('.note-title')) {
                const titleText = note.querySelector('.note-title').textContent.trim();
                if (/diagram/i.test(titleText)) type = 'diagram';
                const title = titleText;
                if (btn.classList.toggle('favorited')) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    // 添加到收藏
                    favoritesArr.push({ type, title });
                } else {
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    // 从收藏移除
                    const idx = favoritesArr.findIndex(item => item.type === type && item.title === title);
                    if (idx !== -1) favoritesArr.splice(idx, 1);
                }
                updateFavoritesList();
            }
        }
    });

    // 2. 在DOMContentLoaded事件内添加弹窗显示/隐藏逻辑
    const docPopup = document.getElementById('docPopup');
    docBin.addEventListener('click', function (e) {
        e.stopPropagation();
        docPopup.style.display = docPopup.style.display === 'block' ? 'none' : 'block';
        // 定位弹窗到文档按钮上方
        const rect = docBin.getBoundingClientRect();
        docPopup.style.position = 'fixed';
        docPopup.style.right = '0px';
        docPopup.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        updateFavoritesList();
    });

    function updateFavoritesList() {
        const list = document.getElementById('favoritesList');
        list.innerHTML = '';
        // 同步红点数字
        const docCount = document.querySelector('.doc-count');
        docCount.textContent = favoritesArr.length;
        if (favoritesArr.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#888; font-size:13px; padding:8px 0;">No favorites yet.</div>';
            return;
        }
        favoritesArr.forEach(item => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';
            div.style.padding = '6px 18px';
            div.style.fontSize = '13px';
            div.innerHTML = `<span style="color:#2196f3;font-weight:bold;margin-right:6px;">[${item.type}]</span><span style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;">${item.title}</span>`;
            list.appendChild(div);
        });
    }
});