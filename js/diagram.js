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
                              <!-- Mermaidͼ������������Ⱦ -->
                          </div>
                          <button class="toggle-view-btn" id="toggleViewBtn">
                              <i class="fas fa-eye"></i> View Diagram
                          </button>
                          <button class="favorite-btn-in-footer" title="�ղ�"><i class="far fa-star"></i></button>
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

                        // 延迟确保svg已渲染
                        setTimeout(() => {
                            const svg = mermaidDiv.querySelector('svg');
                            if (svg && typeof svgPanZoom === 'function') {
                                svgPanZoom(svg, {
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
