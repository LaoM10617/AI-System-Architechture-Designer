function initDiagram() {
    // 修改后的 diagram 逻辑

    generateDiagramBtn.addEventListener('click', async function () {
        console.log('Generate Diagram button clicked!'); // 调试信息

        // 检查是否已经填写了必要的文本信息
        const appType = document.getElementById('appType').value;
        const userCount = document.getElementById('userCount').value;
        const projectDesc = document.getElementById('projectDesc').value;

        console.log('Form values:', { appType, userCount, projectDesc }); // 调试信息

        if (!appType || !userCount || !projectDesc.trim()) {
            alert('请填写应用类型、用户数量和项目描述后生成架构图！');
            return;
        }

        // 收集选中的功能 - 修改选择器
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
                    notes: notes // 添加notes字段，可空
                })
            });

            const data = await response.json();
            console.log('Response received:', data); // 原有
            console.log('Mermaid code from AI:', data.diagram); // 新增，输出AI返回的mermaid代码

            // 移除加载动画
            whiteboard.removeChild(overlay);

            // 移除之前的 diagram 内容
            if (diagramNoteRef && whiteboard.contains(diagramNoteRef)) {
                whiteboard.removeChild(diagramNoteRef);
                diagramNoteRef = null;
            }

            // 创建一个新的Note显示图示内容，带有切换按钮
            const diagramNote = document.createElement('div');
            diagramNote.className = 'note result-note';
            diagramNote.style.top = '500px';
            diagramNote.style.left = '400px';
            diagramNote.style.minWidth = '400px';
            diagramNote.style.maxWidth = '600px';
            diagramNote.style.height = '500px';
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
                              <!-- Mermaid图将在这里渲染 -->
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

            // 为切换按钮添加事件
            const toggleBtn = diagramNote.querySelector('#toggleViewBtn');
            const codeContainer = diagramNote.querySelector('.code-container');
            const mermaidContainer = diagramNote.querySelector('#mermaidContainer');
            const codePre = diagramNote.querySelector('pre');

            // 创建上下文菜单
            const contextMenu = document.createElement('div');
            contextMenu.className = 'custom-context-menu';
            contextMenu.innerHTML = `
                <ul>
                    <li id="viewSource">View Source Code</li>
                    <li id="editDiagram">Edit Diagram</li>
                </ul>
            `;
            contextMenu.style.display = 'none';
            document.body.appendChild(contextMenu);

            // 全局点击隐藏菜单
            document.addEventListener('click', () => {
                contextMenu.style.display = 'none';
            });

            // 存储当前的panZoom实例
            let currentPanZoom = null;

            // 渲染Mermaid图表函数
            const renderMermaidDiagram = async () => {
                // 获取当前Mermaid代码
                const currentMermaidCode = codePre.textContent;
                
                // 移除现有的mermaid div
                let mermaidDiv = mermaidContainer.querySelector('.mermaid');
                if (mermaidDiv) {
                    mermaidContainer.removeChild(mermaidDiv);
                }
                
                // 创建新的mermaid div
                mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.textContent = currentMermaidCode;
                mermaidContainer.appendChild(mermaidDiv);
                
                // 保存当前的缩放和平移状态
                let zoomState = null;
                if (currentPanZoom) {
                    zoomState = {
                        zoom: currentPanZoom.getZoom(),
                        pan: currentPanZoom.getPan()
                    };
                }

                // 初始化Mermaid
                mermaid.initialize({
                    startOnLoad: true,
                    theme: 'default',
                    flowchart: {
                        useMaxWidth: false,
                        htmlLabels: true,
                        width: 800,
                        height: 600
                    }
                });
                
                try {
                    // 渲染图表
                    await mermaid.init(undefined, mermaidDiv);
                    
                    // 等待SVG渲染完成
                    setTimeout(() => {
                        const svg = mermaidDiv.querySelector('svg');
                        if (svg && typeof svgPanZoom === 'function') {
                            // 初始化pan/zoom
                            currentPanZoom = svgPanZoom(svg, {
                                zoomEnabled: true,
                                controlIconsEnabled: true,
                                fit: true,
                                center: true,
                                minZoom: 0.5,
                                maxZoom: 10,
                                panEnabled: true,
                                dblClickZoomEnabled: true,
                                mouseWheelZoomEnabled: true
                            });

                            // 恢复之前的缩放状态
                            if (zoomState) {
                                currentPanZoom.zoom(zoomState.zoom);
                                currentPanZoom.pan(zoomState.pan);
                            }

                            // 添加上下文菜单事件
                            svg.addEventListener('contextmenu', function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                contextMenu.style.display = 'block';
                                contextMenu.style.left = `${e.clientX}px`;
                                contextMenu.style.top = `${e.clientY}px`;
                                
                                const clickedElement = e.target.closest('[id]') || e.target.closest('g');
                                contextMenu.dataset.clickedElement = clickedElement ? clickedElement.id || '' : '';
                                
                                return false;
                            });
                            
                            // 阻止默认右键菜单
                            svg.addEventListener('mousedown', function(e) {
                                if (e.button === 2) {
                                    e.stopPropagation();
                                }
                            });
                            
                            // 其他事件阻止
                            svg.addEventListener('mousedown', function(e) {
                                e.stopPropagation();
                            });
                            svg.addEventListener('mousemove', function(e) {
                                e.stopPropagation();
                            });
                            svg.addEventListener('mouseup', function(e) {
                                e.stopPropagation();
                            });
                            
                            // 调整控制按钮位置
                            setTimeout(() => {
                                const controls = svg.parentElement.querySelector('.svg-pan-zoom-controls');
                                if (controls) {
                                    controls.style.right = '10px';
                                    controls.style.left = 'auto';
                                    controls.style.zIndex = '9999';
                                    controls.style.position = 'absolute';
                                    controls.style.top = '1px';
                                    controls.style.display = 'block';
                                    controls.style.visibility = 'visible';
                                }
                            }, 200);
                        }

                        // 更新下载链接
                        const serializer = new XMLSerializer();
                        const svgStr = serializer.serializeToString(svg);
                        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        const actionsDiv = diagramNote.querySelector('#diagramActions');
                        actionsDiv.innerHTML = `<a href="${url}" download="diagram.svg" style="display:inline-block;padding:6px 16px;background:#2196f3;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">download SVG</a>`;
                    }, 100);
                } catch (error) {
                    console.error('Mermaid rendering error:', error);
                    mermaidDiv.innerHTML = `<div class="mermaid-error">Error rendering diagram: ${error.message}</div>`;
                }
            };

            // 切换按钮事件
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

                    // 每次切换都重新渲染图表
                    renderMermaidDiagram();
                }
            });

            // 双击放大功能
            mermaidContainer.addEventListener('dblclick', function(e) {
                if (e.target.closest('.svg-pan-zoom-controls')) {
                    return;
                }
                
                const currentMermaidCode = codePre.textContent;
                const fullscreen = document.createElement('div');
                fullscreen.className = 'mermaid-fullscreen';
                fullscreen.innerHTML = `
                    <div class="mermaid-container show">
                        <div class="mermaid">
                            ${currentMermaidCode}
                        </div>
                    </div>
                `;
                
                document.body.appendChild(fullscreen);
                
                mermaid.init(undefined, fullscreen.querySelector('.mermaid')).then(() => {
                    setTimeout(() => {
                        const fullscreenSvg = fullscreen.querySelector('svg');
                        if (fullscreenSvg && typeof svgPanZoom === 'function') {
                            const fullscreenPanZoom = svgPanZoom(fullscreenSvg, {
                                zoomEnabled: true,
                                controlIconsEnabled: true,
                                fit: true,
                                center: true,
                                minZoom: 0.5,
                                maxZoom: 10,
                                panEnabled: true,
                                dblClickZoomEnabled: true,
                                mouseWheelZoomEnabled: true
                            });
                            
                            setTimeout(() => {
                                const controls = fullscreenSvg.parentElement.querySelector('.svg-pan-zoom-controls');
                                if (controls) {
                                    controls.style.right = '20px';
                                    controls.style.left = 'auto';
                                    controls.style.top = '20px';
                                    controls.style.zIndex = '9999';
                                    controls.style.position = 'absolute';
                                    controls.style.display = 'block';
                                    controls.style.visibility = 'visible';
                                }
                            }, 200);
                        }
                    }, 500);
                });
                
                fullscreen.addEventListener('click', function(e) {
                    if (e.target === fullscreen) {
                        document.body.removeChild(fullscreen);
                    }
                });
                
                const escHandler = function(e) {
                    if (e.key === 'Escape') {
                        document.body.removeChild(fullscreen);
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);
            });

            // 阻止事件冒泡
            mermaidContainer.addEventListener('mousedown', function(e) {
                e.stopPropagation();
            });
            mermaidContainer.addEventListener('mousemove', function(e) {
                e.stopPropagation();
            });
            mermaidContainer.addEventListener('mouseup', function(e) {
                e.stopPropagation();
            });

            // 上下文菜单事件
            contextMenu.querySelector('#viewSource').addEventListener('click', function() {
                mermaidContainer.classList.remove('show');
                codeContainer.classList.remove('hide');
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i> View Diagram';
                toggleBtn.classList.remove('active');
                contextMenu.style.display = 'none';
            });

            contextMenu.querySelector('#editDiagram').addEventListener('click', function() {
                const editDialog = document.createElement('div');
                editDialog.className = 'edit-mermaid-dialog';
                editDialog.innerHTML = `
                    <div class="edit-dialog-content">
                        <h3>Edit Mermaid Diagram</h3>
                        <textarea id="mermaidEditor" style="width:100%; height:300px; font-family: monospace;">${codePre.textContent}</textarea>
                        <div class="dialog-buttons">
                            <button id="cancelEdit">Cancel</button>
                            <button id="applyEdit">Apply Changes</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(editDialog);
                contextMenu.style.display = 'none';

                editDialog.querySelector('#cancelEdit').addEventListener('click', function() {
                    document.body.removeChild(editDialog);
                });

                editDialog.querySelector('#applyEdit').addEventListener('click', function() {
                    const newMermaidCode = editDialog.querySelector('#mermaidEditor').value;
                    codePre.textContent = newMermaidCode;
                    
                    // 如果当前显示的是图表，重新渲染
                    if (mermaidContainer.classList.contains('show')) {
                        renderMermaidDiagram();
                    }
                    
                    document.body.removeChild(editDialog);
                });
            });

            // 保存到历史
            diagramHistory.push({ content: data.diagram });

            // 如果API返回了架构建议，创建新的便签
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
            alert('架构图生成服务暂时不可用，请确认后端服务可访问后重试。');
            console.error('生成架构图失败:', err);
        }
    });
}

window.initDiagram = initDiagram;