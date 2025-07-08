function initDiagram() {
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
}

window.initDiagram = initDiagram;
