function initDiagram() {
    // �޸����� diagram �߼�

    generateDiagramBtn.addEventListener('click', async function () {
        console.log('Generate Diagram button clicked!'); // ������Ϣ

        // ����Ƿ��Ѿ���д�˱�Ҫ�ı�����Ϣ
        const appType = document.getElementById('appType').value;
        const userCount = document.getElementById('userCount').value;
        const projectDesc = document.getElementById('projectDesc').value;

        console.log('Form values:', { appType, userCount, projectDesc }); // ������Ϣ

        if (!appType || !userCount || !projectDesc.trim()) {
            alert('������дӦ�����͡��û���������Ŀ������Ȼ��������ͼ��');
            return;
        }

        // �ռ�ѡ�еĹ��� - �޸�ѡ����
        const features = [];
        for (let i = 1; i <= 8; i++) {
            if (document.getElementById('feature' + i).checked) {
                features.push(document.querySelector('label[for="feature' + i + '"]').textContent);
            }
        }

        console.log('Selected features:', features); // ������Ϣ

        // ��ʾ���ض���
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        whiteboard.appendChild(overlay);

        try {
            console.log('Sending request to backend...'); // ������Ϣ
            const notes = [];
            // ��ѡ���ռ���ǩ���ݣ��ͼܹ����ɱ���һ��
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
                    notes: notes // ����notes�ֶΣ���˱���
                })
            });

            const data = await response.json();
            console.log('Response received:', data); // 原有
            console.log('Mermaid code from AI:', data.diagram); // 新增，输出AI返回的mermaid代码

            // Ƴض
            whiteboard.removeChild(overlay);

            // �Ƴ�֮ǰ�� diagram ������
            if (diagramNoteRef && whiteboard.contains(diagramNoteRef)) {
                whiteboard.removeChild(diagramNoteRef);
                diagramNoteRef = null;
            }

            // ����һ���µ�Note��ʾͼʾ�ı��������л���ť
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

            // �����л���ť�¼�
            const toggleBtn = diagramNote.querySelector('#toggleViewBtn');
            const codeContainer = diagramNote.querySelector('.code-container');
            const mermaidContainer = diagramNote.querySelector('#mermaidContainer');

            toggleBtn.addEventListener('click', function () {
                if (mermaidContainer.classList.contains('show')) {
                    // �л���������ͼ
                    mermaidContainer.classList.remove('show');
                    codeContainer.classList.remove('hide');
                    toggleBtn.innerHTML = '<i class="fas fa-eye"></i> View Diagram';
                    toggleBtn.classList.remove('active');
                } else {
                    // �л���ͼ����ͼ
                    codeContainer.classList.add('hide');
                    mermaidContainer.classList.add('show');
                    toggleBtn.innerHTML = '<i class="fas fa-code"></i> View Code';
                    toggleBtn.classList.add('active');

                    // ��ȾMermaidͼ��
                    if (!mermaidContainer.querySelector('.mermaid')) {
                        const mermaidDiv = document.createElement('div');
                        mermaidDiv.className = 'mermaid';
                        mermaidDiv.textContent = data.diagram;
                        mermaidContainer.appendChild(mermaidDiv);
                        
                        // 为mermaid容器添加事件阻止，防止触发便签拖动
                        mermaidContainer.addEventListener('mousedown', function(e) {
                            e.stopPropagation();
                        });
                        mermaidContainer.addEventListener('mousemove', function(e) {
                            e.stopPropagation();
                        });
                        mermaidContainer.addEventListener('mouseup', function(e) {
                            e.stopPropagation();
                        });
                        
                        // 添加双击放大功能
                        mermaidContainer.addEventListener('dblclick', function(e) {
                            // 如果双击的是控制按钮，不放大
                            if (e.target.closest('.svg-pan-zoom-controls')) {
                                return;
                            }
                            
                            // 创建全屏显示
                            const fullscreen = document.createElement('div');
                            fullscreen.className = 'mermaid-fullscreen';
                            fullscreen.innerHTML = `
                                <div class="mermaid-container show">
                                    <div class="mermaid">
                                        ${data.diagram}
                                    </div>
                                </div>
                            `;
                            
                            document.body.appendChild(fullscreen);
                            
                            // 重新初始化mermaid
                            mermaid.initialize({
                                startOnLoad: true,
                                theme: 'default',
                                flowchart: {
                                    useMaxWidth: false,
                                    htmlLabels: true,
                                    width: 1200,
                                    height: 800
                                }
                            });
                            mermaid.init(undefined, fullscreen.querySelector('.mermaid'));
                            
                            // 延迟确保svg已渲染，然后初始化svg-pan-zoom
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
                                    

                                    

                                    
                                    // 调整全屏模式下的控制按钮位置
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
                            
                            // 点击全屏背景关闭
                            fullscreen.addEventListener('click', function(e) {
                                if (e.target === fullscreen) {
                                    document.body.removeChild(fullscreen);
                                }
                            });
                            
                            // ESC键关闭
                            const escHandler = function(e) {
                                if (e.key === 'Escape') {
                                    document.body.removeChild(fullscreen);
                                    document.removeEventListener('keydown', escHandler);
                                }
                            };
                            document.addEventListener('keydown', escHandler);
                        });

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
                        mermaid.init(undefined, mermaidDiv);

                        // 延迟确保svg已渲染
                        setTimeout(() => {
                            const svg = mermaidDiv.querySelector('svg');
                            if (svg && typeof svgPanZoom === 'function') {
                                // 在svg上添加事件监听器，阻止事件冒泡到便签
                                svg.addEventListener('mousedown', function(e) {
                                    e.stopPropagation();
                                });
                                svg.addEventListener('mousemove', function(e) {
                                    e.stopPropagation();
                                });
                                svg.addEventListener('mouseup', function(e) {
                                    e.stopPropagation();
                                });
                                
                                const panZoom = svgPanZoom(svg, {
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
                                

                                

                                
                                // 调整控制按钮位置到右边
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
                        }, 500);

                        // 下载svg功能不变
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

            // ���浽��ʷ
            diagramHistory.push({ content: data.diagram });

            // ���API�����˼ܹ����������½����ǩ
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
            console.error('Error in generateDiagramBtn:', err); // ������Ϣ
            whiteboard.removeChild(overlay);
            alert('����ͼ���ɷ�������ʧ�ܣ���ȷ�Ϻ�˷������������������ط��ʡ�');
            console.error('��������ͼ����ʧ��:', err);
        }
    });
}

window.initDiagram = initDiagram;
