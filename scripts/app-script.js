const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;
        createApp({
            setup() {
                // ─── UI STATE ────────────────────────────────────────────
                const collapsed = ref(false);
                const dialog = ref({ show: false, type: 'alert', message: '', inputValue: '', resolve: null }); // drives the global modal — see dialogConfirm/dialogCancel
                const currentView = ref('dashboard');
                const viewMode = ref('workflow');
                const searchQuery = ref('');
                const viewerOpen = ref(false);
                const detailsOpen = ref(false);
                const dashShowArchived = ref(false);
                const dbShowArchived = ref(false);
                const toast = ref({ show: false, message: '', type: 'success' });
                const isRefreshing = ref(false);
                const isSaving = ref(false);
                const currentUserEmail = ref('');

                // ─── EDITOR STATE ─────────────────────────────────────────
                const activeViewerStage = ref(0);   // which phase tab is selected in the editor
                const editingType = ref('project');  // 'project' or 'template'
                const editingObject = ref(null);     // the object being edited (deep clone, never the original)
                const selectedProject = ref(null);   // the project open in the detail panel (read-only view)

                // ─── SORTABLE DOM REFS ────────────────────────────────────
                // These are template refs bound to the drag-and-drop lists.
                // We store the SortableJS instances so we can destroy and rebuild them
                // when the active stage changes (otherwise the old instance goes stale).
                const phasesSortableRef = ref(null);
                const tasksSortableRef = ref(null);
                let phaseSortableInstance = null;
                let taskSortableInstance = null;

                // ─── DRIVE STATE ──────────────────────────────────────────
                const isDriveLoading = ref(false);
                const driveDragActive = ref(false);
                const driveFiles = ref([]);
                const driveFolders = ref([]);

                // ─── FILTER & SORT STATE ──────────────────────────────────
                const filterStatus = ref('ALL');
                const filterOwner = ref('ALL');
                const filterFolder = ref('ALL');
                const sortBy = ref('date_desc');

                // ─── GANTT STATE ──────────────────────────────────────────
                const ganttScale = ref('monthly');
                const ganttProjectId = ref(null);

                // ─── FOLDER STATE ─────────────────────────────────────────
                const folderState = ref({});
                const customFolders = ref(['Uncategorized']);

                // ─── DICTATION STATE ──────────────────────────────────────
                const dictationState = ref({ isListening: false, taskId: null, field: null, recognition: null });

                // ─── DATA MODELS ──────────────────────────────────────────
                const projects = ref([]);
                const templates = ref([]);

                // ─── CONFIG STATE (loaded from GAS on mount) ──────────────
                const config = ref({ cpTeam: [], externalTeam: [], suggestions: [] });
                const newCpMember = ref('');
                const newExternalMember = ref('');
                const newSuggestion = ref({ title: '', icon: 'fa-tasks' });

                // ─── UI CONSTANTS ─────────────────────────────────────────
                const iconOptions = [
                    'fa-clipboard-list', 'fa-pencil-ruler', 'fa-box', 'fa-vial', 
                    'fa-truck', 'fa-leaf', 'fa-check-double', 'fa-rocket', 
                    'fa-industry', 'fa-microscope', 'fa-palette', 'fa-calculator',
                    'fa-spray-can', 'fa-tooth', 'fa-pump-soap', 'fa-pump-medical',
                    'fa-chart-line', 'fa-bullseye', 'fa-cogs'
                ];

                const menuItems = [
                    { id: 'summary', icon: 'fa-chart-line', label: 'Executive Summary' }, 
                    { id: 'dashboard', icon: 'fa-chart-pie', label: 'Portfolio' }, 
                    { id: 'database', icon: 'fa-database', label: 'Database' },
                    { id: 'templates', icon: 'fa-scroll', label: 'Templates' },
                    { id: 'config', icon: 'fa-cogs', label: 'Configuration' },
                    { id: 'gantt', icon: 'fa-bars-progress', label: 'Gantt Timeline' }
                ];

                // ─── COMPUTED: UI ─────────────────────────────────────
                const viewTitle = computed(() => {
                    const found = menuItems.find(m => m.id === currentView.value);
                    return found ? found.label : 'PackTrack';
                });

                // ─── UTILITIES ────────────────────────────────────────────
                const generateLocalId = () => 'l_' + Math.random().toString(36).substr(2, 9);

                const showToast = (msg, type = 'success') => {
                    toast.value = { show: true, message: msg, type };
                    setTimeout(() => { toast.value.show = false; }, 3500);
                };

                // Promise-based replacements for browser alert/confirm/prompt.
                // Usage: await showConfirm('Delete?') returns true/false
                //        await showPrompt('Enter name:') returns string or null
                const showAlert = (message) => new Promise(resolve => {
                    dialog.value = { show: true, type: 'alert', message, inputValue: '', resolve };
                });
                const showConfirm = (message) => new Promise(resolve => {
                    dialog.value = { show: true, type: 'confirm', message, inputValue: '', resolve };
                });
                const showPrompt = (message) => new Promise(resolve => {
                    dialog.value = { show: true, type: 'prompt', message, inputValue: '', resolve };
                });

                // Called by the OK/Confirm button in the modal
                const dialogConfirm = () => {
                    const type = dialog.value.type;
                    const val = type === 'prompt' ? dialog.value.inputValue : true;
                    dialog.value.resolve(val);
                    dialog.value.show = false;
                };
                // Called by the Cancel button or Esc key
                const dialogCancel = () => {
                    const type = dialog.value.type;
                    dialog.value.resolve(type === 'prompt' ? null : false);
                    dialog.value.show = false;
                };

                // ─── BACKEND HELPER ───────────────────────────────────────
                // Single point of contact for all google.script.run calls.
                // Always attaches a failure handler — if none is provided, shows a toast.
                // If google is not defined (local dev), the call is silently skipped.
                const gsRun = (fnName, args = [], onSuccess = null, onError = null) => {
                    if (typeof google === 'undefined' || !google.script) return;
                    let runner = google.script.run
                        .withSuccessHandler((result) => { if (onSuccess) onSuccess(result); })
                        .withFailureHandler((err) => {
                            if (onError) onError(err);
                            else showToast(err.message || 'An error occurred.', 'error');
                        });
                    runner[fnName](...args);
                };

                // ─── DATA FETCHING ────────────────────────────────────
                // Loads everything from the backend on mount.
                // Also called manually via the refresh button in the header.
                const fetchData = () => {
                    isRefreshing.value = true;
                    gsRun('getAppData', [], (data) => {
                        projects.value = data.projects || [];
                        templates.value = data.templates || [];
                        if (data.folders && data.folders.length > 0) {
                            const fs = {};
                            const fNames = [];
                            data.folders.forEach(f => {
                                fNames.push(f.name);
                                fs[f.name] = f.isOpen;
                            });
                            customFolders.value = fNames;
                            folderState.value = fs;
                        }
                        if (data.config) config.value = data.config;
                        isRefreshing.value = false;
                    }, (err) => {
                        showToast('Error loading data: ' + err.message, 'error');
                        isRefreshing.value = false;
                    });
                    if (typeof google === 'undefined' || !google.script) setTimeout(() => isRefreshing.value = false, 800);
                };

                onMounted(() => {
                    fetchData();
                    gsRun('getCurrentUserEmail', [], (email) => { currentUserEmail.value = email || ''; });
                });

                // ─── DRAG & DROP (SortableJS) ─────────────────────────
                // initSortable wires up the phases list. We use nextTick because the
                // DOM isn't updated yet when the editor opens.
                const initSortable = () => {
                    nextTick(() => {
                        if (phasesSortableRef.value) {
                            if (phaseSortableInstance) phaseSortableInstance.destroy();
                            phaseSortableInstance = new Sortable(phasesSortableRef.value, {
                                handle: '.drag-handle',
                                animation: 150,
                                ghostClass: 'sortable-ghost',
                                onEnd: (evt) => {
                                    const moved = editingObject.value.stages.splice(evt.oldIndex, 1)[0];
                                    editingObject.value.stages.splice(evt.newIndex, 0, moved);
                                    activeViewerStage.value = evt.newIndex;
                                }
                            });
                        }
                    });
                };

                // Rebuild the tasks sortable whenever the active stage changes,
                // because the task list DOM node is replaced by v-if.
                watch(activeViewerStage, () => {
                    nextTick(() => {
                        if (tasksSortableRef.value) {
                            if (taskSortableInstance) taskSortableInstance.destroy();
                            taskSortableInstance = new Sortable(tasksSortableRef.value, {
                                handle: '.drag-handle',
                                animation: 150,
                                ghostClass: 'sortable-ghost',
                                onEnd: (evt) => {
                                    const moved = editingObject.value.stages[activeViewerStage.value].tasks.splice(evt.oldIndex, 1)[0];
                                    editingObject.value.stages[activeViewerStage.value].tasks.splice(evt.newIndex, 0, moved);
                                }
                            });
                        }
                    });
                });

                watch(viewerOpen, (val) => {
                    if(val && editingType.value === 'project') initSortable();
                });

                // Auto-recalculate non-overridden phase statuses whenever a task
                // is checked/unchecked inside the editor modal.
                watch(
                    () => editingObject.value?.stages?.flatMap(s => (s.tasks || []).map(t => t.done)).join(','),
                    () => {
                        if (!editingObject.value) return;
                        editingObject.value.stages.forEach(stage => {
                            if (!stage.statusOverride && (stage.tasks || []).length > 0)
                                stage.status = computePhaseStatus(stage);
                        });
                    }
                );

                // ─── DICTATION ───────────────────────────────────────
                // Checks if the mic is active for a specific task field.
                // Used by the template to show the pulsing mic icon.
                const isDictating = (taskId, field) => dictationState.value.isListening && dictationState.value.taskId === taskId && dictationState.value.field === field;

                const toggleDictation = (task, fieldName) => {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (!SpeechRecognition) {
                        showToast("Speech Recognition not supported. Please use Chrome, Edge, or Safari.", "error");
                        return;
                    }
                    
                    if (isDictating(task._localId, fieldName)) {
                        dictationState.value.recognition.stop();
                        dictationState.value = { isListening: false, taskId: null, field: null, recognition: null };
                        return;
                    } else if (dictationState.value.isListening) {
                        dictationState.value.recognition.stop(); 
                    }

                    const recognition = new SpeechRecognition();
                    recognition.continuous = false;
                    recognition.interimResults = true;
                    
                    recognition.onstart = () => {
                        dictationState.value = { isListening: true, taskId: task._localId, field: fieldName, recognition: recognition };
                    };

                    // Preserve whatever was already typed in the field before dictation started
                    let finalTranscript = task[fieldName] ? task[fieldName] + ' ' : '';
                    
                    // We show interim results live while the user speaks,
                    // then lock them in as final when the browser confirms them.
                    recognition.onresult = (event) => {
                        let interimTranscript = '';
                        let newFinal = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            if (event.results[i].isFinal) {
                                newFinal += event.results[i][0].transcript;
                            } else {
                                interimTranscript += event.results[i][0].transcript;
                            }
                        }
                        finalTranscript += newFinal;
                        task[fieldName] = finalTranscript + interimTranscript;
                    };

                    recognition.onerror = (event) => { 
                        console.error("Speech recognition error", event.error);
                    };
                    
                    recognition.onend = () => {
                        if(isDictating(task._localId, fieldName)) {
                            dictationState.value = { isListening: false, taskId: null, field: null, recognition: null };
                        }
                    };

                    try {
                        recognition.start();
                    } catch (e) {
                        showToast("Microphone access blocked. Try opening the Web App directly.", "error");
                    }
                };

                // ─── GOOGLE CHAT ──────────────────────────────────────
                const sendChat = (context, messageText) => {
                    if(!messageText || messageText.trim() === '') {
                        showToast("Message cannot be empty.", "error");
                        return;
                    }

                    const payloadText = `*Update in Project: ${editingObject.value.code || 'Draft'} - ${editingObject.value.title}*\n*Context:* ${context}\n*Message:* ${messageText}`;
                    
                    gsRun('sendGoogleChatNotification', [payloadText], (res) => {
                        if(res.success) showToast("Sent to Google Chat!", "success");
                        else showToast("Failed to send: " + (res.error || "No webhook URL configured on server."), "error");
                    });
                    if (typeof google === 'undefined' || !google.script) showToast("Mock: Sent to Google Chat!", "success");
                };

                // ─── GOOGLE DRIVE ─────────────────────────────────────
                // Parses a full Drive URL pasted by the user and extracts the folder ID.
                // Once extracted we discard the URL and store only the ID.
                const extractDriveId = () => {
                    if(!editingObject.value.driveRootUrl) return;
                    const url = editingObject.value.driveRootUrl;
                    const regex = /(?:folders\/|id=)([a-zA-Z0-9_-]{15,})/;
                    const match = url.match(regex);
                    if(match && match[1]) {
                        editingObject.value.driveFolderId = match[1];
                        editingObject.value.driveRootUrl = '';
                        fetchDriveContents(match[1]);
                    } else {
                        showToast("Could not extract a valid Google Drive Folder ID from that URL.", "error");
                    }
                };

                const fetchDriveContents = (folderId) => {
                    if (!folderId) return;
                    isDriveLoading.value = true;
                    driveFolders.value = []; 
                    driveFiles.value = [];
                    gsRun('getDriveContents', [folderId], (res) => {
                        driveFolders.value = [...res.folders];
                        driveFiles.value = [...res.files];
                        isDriveLoading.value = false;
                    }, (err) => {
                        showToast('Failed to fetch Drive folder: ' + err.message, 'error');
                        isDriveLoading.value = false;
                    });
                    if (typeof google === 'undefined' || !google.script) setTimeout(() => {
                        driveFiles.value = [{id:'1', name:'Briefing_Mock.pdf', mimeType:'application/pdf', url:'#'}];
                        isDriveLoading.value = false;
                    }, 500);
                };

                watch(() => editingObject.value?.driveFolderId, (newId) => {
                    if(newId && viewerOpen.value && editingType.value === 'project') fetchDriveContents(newId);
                });

                const createDriveSubFolder = async () => {
                    const name = await showPrompt("Enter subfolder name:");
                    if(!name || name.trim()==='') return;
                    isDriveLoading.value = true;
                    gsRun('createDriveSubFolder', [editingObject.value.driveFolderId, name.trim()], () => fetchDriveContents(editingObject.value.driveFolderId));
                };

                const deleteDriveItem = async (id, isFolder) => {
                    if(!await showConfirm(`Delete this ${isFolder ? 'folder' : 'file'}?`)) return;
                    isDriveLoading.value = true;
                    gsRun('deleteDriveItem', [id, isFolder], () => fetchDriveContents(editingObject.value.driveFolderId));
                };

                // Only handles the first dropped file — multi-file drop is not supported.
                const handleDriveDrop = (e) => {
                    driveDragActive.value = false;
                    const files = e.dataTransfer.files;
                    if(files.length === 0) return;
                    const file = files[0]; 
                    
                    // Convert to base64 so it can be sent through google.script.run
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target.result;
                        isDriveLoading.value = true;
                        gsRun('uploadFileToDrive', [editingObject.value.driveFolderId, base64, file.name, file.type], () => fetchDriveContents(editingObject.value.driveFolderId));
                    };
                    reader.readAsDataURL(file);
                };

                const getFileIcon = (mimeType) => {
                    if(mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
                    if(mimeType.includes('image')) return 'fa-file-image text-blue-500';
                    if(mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'fa-file-excel text-green-600';
                    if(mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word text-blue-700';
                    return 'fa-file-alt text-slate-400';
                };

                // ─── CONFIGURATION ───────────────────────────────────
                const saveConfig = () => {
                    gsRun('saveConfig', [JSON.parse(JSON.stringify(config.value))], () => showToast("Configuration Saved Successfully!"));
                    if (typeof google === 'undefined' || !google.script) showToast("Mock Config Saved Successfully!");
                };

                const addTeamMember = (listKey, nameRef) => {
                    if(nameRef.trim() !== '') {
                        config.value[listKey].push(nameRef.trim());
                        if(listKey==='cpTeam') newCpMember.value = '';
                        if(listKey==='externalTeam') newExternalMember.value = '';
                    }
                };
                const removeTeamMember = (listKey, idx) => config.value[listKey].splice(idx, 1);
                
                const addSuggestedPhase = () => {
                    if(newSuggestion.value.title.trim() !== '') {
                        config.value.suggestions.push(JSON.parse(JSON.stringify(newSuggestion.value)));
                        newSuggestion.value.title = '';
                    }
                };
                const removeSuggestedPhase = (idx) => config.value.suggestions.splice(idx, 1);

                // ─── FINANCE ──────────────────────────────────────────
                // Converts the user-entered amount + unit (k/M/none) to a raw number
                // stored in finances.calculated. That's what stats and KPIs use.
                const calculateFinance = () => {
                    if(!editingObject.value.finances) return;
                    const f = editingObject.value.finances;
                    let val = parseFloat(f.amount) || 0;
                    if (f.unit === 'M') val *= 1000000;
                    else if (f.unit === 'k') val *= 1000;
                    f.calculated = val;
                };

                const formatFinance = (val) => {
                    if (!val || isNaN(val)) return '0.00';
                    const abs = Math.abs(val);
                    const sign = val < 0 ? '-' : '';
                    if (abs >= 1000000) return sign + (abs / 1000000).toFixed(2) + 'M';
                    if (abs >= 1000) return sign + (abs / 1000).toFixed(2) + 'k';
                    return sign + abs.toFixed(2);
                };

                // ─── FOLDERS ──────────────────────────────────────────
                // Debounced — waits 1s after the last change before hitting the backend.
                // This avoids a backend call on every keystroke when reordering.
                let folderSaveTimeout = null;
                const pushFoldersToBackend = () => {
                    if (typeof google === 'undefined' || !google.script) return;
                    clearTimeout(folderSaveTimeout);
                    folderSaveTimeout = setTimeout(() => {
                        const payload = customFolders.value.map((fName, index) => {
                            return { name: fName, isOpen: folderState.value[fName] === true, order: index };
                        });
                        gsRun('saveFoldersToSheet', [payload]);
                    }, 1000);
                };

                watch(folderState, () => pushFoldersToBackend(), { deep: true });
                watch(customFolders, () => pushFoldersToBackend(), { deep: true });

                const toggleFolder = (fName) => folderState.value[fName] = !folderState.value[fName];

                const createNewFolder = async () => {
                    const name = await showPrompt("Enter new folder name:");
                    if (name && name.trim() !== '' && !customFolders.value.includes(name.trim())) {
                        customFolders.value.push(name.trim());
                        folderState.value[name.trim()] = true;
                    }
                };

                const deleteFolder = async (fName) => {
                    if (fName === 'Uncategorized') return;
                    if (await showConfirm(`Delete folder "${fName}"? Projects will move to Uncategorized.`)) {
                        customFolders.value = customFolders.value.filter(f => f !== fName);
                        delete folderState.value[fName];
                        projects.value.forEach(p => {
                            if (p.folder === fName) {
                                p.folder = 'Uncategorized';
                                gsRun('saveProjectToSheet', [JSON.parse(JSON.stringify(p))]);
                            }
                        });
                    }
                };

                const handleMoveFolder = (project) => {
                    gsRun('saveProjectToSheet', [JSON.parse(JSON.stringify(project))]);
                };

                // ─── COMPUTED: PROJECTS & FOLDERS ────────────────────
                // Groups already-filtered projects by folder name.
                // If a project has a folder that doesn't exist in customFolders yet,
                // it gets added automatically (handles data imported from older versions).
                const projectsByFolder = computed(() => {
                    const grouped = {};
                    customFolders.value.forEach(f => { grouped[f] = []; });
                    filteredProjects.value.forEach(p => {
                        const f = p.folder || 'Uncategorized';
                        if(!grouped[f]) {
                            grouped[f] = [];
                            if(!customFolders.value.includes(f)) customFolders.value.push(f);
                        }
                        if(folderState.value[f] === undefined) folderState.value[f] = true;
                        grouped[f].push(p);
                    });
                    return grouped;
                });

                // Dashboard and Database views have independent archived toggles,
                // so we pick the right one based on which view is active.
                const filteredProjects = computed(() => {
                    // Decouple Active/Archived filter based on current view
                    const showArch = currentView.value === 'database' ? dbShowArchived.value : dashShowArchived.value;
                    let res = projects.value.filter(p => p.archived === showArch);
                    
                    if (searchQuery.value) res = res.filter(p => p.title.toLowerCase().includes(searchQuery.value.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.value.toLowerCase()));
                    if (filterStatus.value !== 'ALL') res = res.filter(p => p.cycleStatus === filterStatus.value);
                    if (filterOwner.value !== 'ALL') res = res.filter(p => p.projectOwner === filterOwner.value || (!p.projectOwner && filterOwner.value === 'Unassigned'));
                    if (filterFolder.value !== 'ALL') res = res.filter(p => (p.folder || 'Uncategorized') === filterFolder.value);

                    res.sort((a, b) => {
                        if (sortBy.value === 'name_asc') return a.title.localeCompare(b.title);
                        if (sortBy.value === 'date_asc') return new Date(a.createdAt) - new Date(b.createdAt);
                        if (sortBy.value === 'date_desc') return new Date(b.createdAt) - new Date(a.createdAt);
                        if (sortBy.value === 'status') return a.cycleStatus.localeCompare(b.cycleStatus);
                        return 0;
                    });
                    return res;
                });

                const filteredTemplates = computed(() => templates.value.filter(t => !searchQuery.value || t.name.toLowerCase().includes(searchQuery.value.toLowerCase())));

                const getProjectAlerts = (p) => {
                    if(!p || !p.stages) return 0;
                    return p.stages.reduce((acc, st) => acc + (st.tasks ? st.tasks.filter(t => t.alert).length : 0), 0);
                };

                // Task-level progress if tasks exist, phase-level if they don't.
                const calculateProgress = (p) => {
                    if (!p || !p.stages || !p.stages.length) return 0;
                    let totalTasks = 0;
                    let completedTasks = 0;
                    p.stages.forEach(s => {
                        if (s.tasks && s.tasks.length > 0) {
                            totalTasks += s.tasks.length;
                            completedTasks += s.tasks.filter(t => t.done).length;
                        } else {
                            // Fallback to phase status weighting if no granular tasks exist
                            totalTasks += 1;
                            if (s.status === 'COMPLETED') completedTasks += 1;
                        }
                    });
                    return totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
                };

                const getCurrentPhase = (p) => {
                    if (!p || !p.stages || !p.stages.length) return 'Not Started';
                    const current = p.stages.find(s => s.status !== 'COMPLETED');
                    return current ? current.title : 'All Phases Completed';
                };

                const getFolderKPI = (folderProjects) => {
                    return folderProjects.reduce((acc, p) => {
                        if(p.finances && p.finances.calculated) {
                            if(p.finances.calculated < 0) acc.ftg += p.finances.calculated;
                            else acc.onCost += p.finances.calculated;
                        }
                        return acc;
                    }, { ftg: 0, onCost: 0 });
                };

                const activeProjectsList = computed(() => filteredProjects.value.filter(p => !p.archived));

                const executiveSummary = computed(() => {
                    const active = filteredProjects.value.filter(p => !p.archived);
                    let totalProg = 0;
                    const atRisk = [];
                    active.forEach(p => {
                        totalProg += calculateProgress(p);
                        if (p.cycleStatus === 'DELAYED' || p.cycleStatus === 'AT RISK' || getProjectAlerts(p) > 0) {
                            atRisk.push(p);
                        }
                    });
                    const globalProgress = active.length ? Math.round(totalProg / active.length) : 0;
                    
                    return { globalProgress, atRiskProjects: atRisk };
                });

                const stats = computed(() => {
                    const base = currentView.value === 'summary' ? filteredProjects.value : projects.value;
                    const total = base.length;
                    const active = base.filter(p => !p.archived).length;
                    const archived = base.filter(p => p.archived).length;
                    const activePrj = base.filter(p => !p.archived);
                    
                    const alerts = activePrj.reduce((acc, p) => acc + getProjectAlerts(p), 0);
                    
                    let ftgTotalNum = 0, onCostTotalNum = 0, ftgCount = 0, onCostCount = 0;
                    activePrj.forEach(p => {
                        if(p.finances && p.finances.calculated) {
                            if(p.finances.calculated < 0) { ftgTotalNum += p.finances.calculated; ftgCount++; }
                            else { onCostTotalNum += p.finances.calculated; onCostCount++; }
                        }
                    });

                    return { total, active, archived, alerts, ftgTotal: formatFinance(ftgTotalNum), onCostTotal: formatFinance(onCostTotalNum), ftgCount, onCostCount };
                });

                // ─── GANTT ────────────────────────────────────────────
                // Shared date parser — always UTC (T00:00:00Z) to match DateService._parseDate on the backend.
                const ganttParseDate = (str) => {
                    const d = new Date(str + 'T00:00:00Z');
                    return isNaN(d.getTime()) ? null : d;
                };

                // Mirrors DateService.getProjectDateRange — extracts all stage+task dates,
                // picks min/max, then adds a 7-day buffer on each side.
                const projectDateRange = computed(() => {
                    const stages = selectedProject.value?.stages;
                    if (!stages || stages.length === 0) {
                        const today = new Date();
                        return { start: today, end: new Date(today.getTime() + 30 * 864e5), totalDays: 30 };
                    }

                    const timestamps = [];
                    stages.forEach(s => {
                        if (s.startDate) { const d = ganttParseDate(s.startDate); if (d) timestamps.push(d.getTime()); }
                        if (s.endDate)   { const d = ganttParseDate(s.endDate);   if (d) timestamps.push(d.getTime()); }
                        (s.tasks || []).forEach(t => {
                            if (t.startDate) { const d = ganttParseDate(t.startDate); if (d) timestamps.push(d.getTime()); }
                            if (t.endDate)   { const d = ganttParseDate(t.endDate);   if (d) timestamps.push(d.getTime()); }
                        });
                    });

                    if (timestamps.length === 0) {
                        const today = new Date();
                        return { start: today, end: new Date(today.getTime() + 30 * 864e5), totalDays: 30 };
                    }

                    const BUFFER = 7 * 864e5;
                    const minDate = new Date(Math.min(...timestamps) - BUFFER);
                    const maxDate = new Date(Math.max(...timestamps) + BUFFER);
                    const totalDays = Math.max(1, Math.round((maxDate - minDate) / 864e5));
                    return { start: minDate, end: maxDate, totalDays };
                });

                // Mirrors GanttService.generateGridColumns — weekly/monthly/yearly column labels.
                const ganttGridColumns = computed(() => {
                    const { start, end, totalDays } = projectDateRange.value;
                    const cols = [];
                    if (ganttScale.value === 'weekly') {
                        let w = 1;
                        for (let i = 0; i < totalDays; i += 7) cols.push('W' + w++);
                    } else if (ganttScale.value === 'yearly') {
                        let curr = new Date(start);
                        while (curr.getFullYear() <= end.getFullYear()) {
                            cols.push(curr.getFullYear().toString());
                            curr.setFullYear(curr.getFullYear() + 1);
                        }
                    } else {
                        let curr = new Date(start);
                        while (curr < end) {
                            cols.push(curr.toLocaleString('en-US', { month: 'short', year: '2-digit' }));
                            curr.setMonth(curr.getMonth() + 1);
                        }
                    }
                    return cols.length > 0 ? cols : ['Timeline'];
                });

                // Mirrors GanttService.calculateBarStyle — left% and width% relative to the date range.
                // Min width 2% so single-day tasks are always visible.
                const getGanttBarStyle = (item) => {
                    if (!item.startDate || !item.endDate) return { display: 'none' };
                    const start = ganttParseDate(item.startDate);
                    const end   = ganttParseDate(item.endDate);
                    if (!start || !end) return { display: 'none' };
                    const range = projectDateRange.value;
                    const totalMs = range.totalDays * 864e5;
                    const leftPct  = Math.max(0, Math.min(100, ((start - range.start) / totalMs) * 100));
                    const widthPct = Math.max(2, Math.min(100 - leftPct, ((end - start) / totalMs) * 100));
                    return { left: leftPct.toFixed(2) + '%', width: widthPct.toFixed(2) + '%' };
                };


                // ─── GANTT VIEW (multi-project timeline) ─────────────────
                const ganttViewMode = ref('all');
                const ganttFilterCategory = ref('ALL');
                const ganttFilterOwner = ref('ALL');
                const ganttFilterStatus = ref('ALL');

                const projectColors = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-fuchsia-500','bg-teal-500'];
                const getProjectColor = (idx) => projectColors[idx % projectColors.length];

                const ganttCategories = computed(() => ['ALL', ...new Set(projects.value.map(p => p.category).filter(Boolean))]);
                const ganttOwners    = computed(() => ['ALL', ...new Set(projects.value.map(p => p.projectOwner).filter(Boolean))]);

                const ganttVisibleProjects = computed(() => {
                    let list = projects.value.filter(p => !p.archived);
                    if (ganttViewMode.value === 'single') {
                        const id = ganttProjectId.value || (list[0] && list[0].id);
                        return id ? list.filter(p => p.id === id) : list.slice(0, 1);
                    }
                    if (ganttFilterCategory.value !== 'ALL') list = list.filter(p => p.category === ganttFilterCategory.value);
                    if (ganttFilterOwner.value   !== 'ALL') list = list.filter(p => p.projectOwner === ganttFilterOwner.value);
                    if (ganttFilterStatus.value  !== 'ALL') list = list.filter(p => p.cycleStatus  === ganttFilterStatus.value);
                    return list;
                });

                const ganttAllDateRange = computed(() => {
                    const all = ganttVisibleProjects.value;
                    if (!all.length) { const t = new Date(); return { start: t, end: new Date(t.getTime() + 30*864e5), totalDays: 30 }; }
                    const ts = [];
                    all.forEach(p => (p.stages || []).forEach(s => {
                        if (s.startDate) { const d = ganttParseDate(s.startDate); if (d) ts.push(d.getTime()); }
                        if (s.endDate)   { const d = ganttParseDate(s.endDate);   if (d) ts.push(d.getTime()); }
                        (s.tasks || []).forEach(t => {
                            if (t.startDate) { const d = ganttParseDate(t.startDate); if (d) ts.push(d.getTime()); }
                            if (t.endDate)   { const d = ganttParseDate(t.endDate);   if (d) ts.push(d.getTime()); }
                        });
                    }));
                    if (!ts.length) { const t = new Date(); return { start: t, end: new Date(t.getTime() + 30*864e5), totalDays: 30 }; }
                    const B = 7 * 864e5;
                    const mn = new Date(Math.min(...ts) - B), mx = new Date(Math.max(...ts) + B);
                    return { start: mn, end: mx, totalDays: Math.max(1, Math.round((mx - mn) / 864e5)) };
                });

                const ganttAllGridColumns = computed(() => {
                    const { start, end, totalDays } = ganttAllDateRange.value;
                    const cols = [];
                    if (ganttScale.value === 'weekly') {
                        let w = 1; for (let i = 0; i < totalDays; i += 7) cols.push('W' + w++);
                    } else if (ganttScale.value === 'yearly') {
                        let c = new Date(start); while (c.getFullYear() <= end.getFullYear()) { cols.push(c.getFullYear().toString()); c.setFullYear(c.getFullYear() + 1); }
                    } else {
                        let c = new Date(start); while (c < end) { cols.push(c.toLocaleString('en-US', { month: 'short', year: '2-digit' })); c.setMonth(c.getMonth() + 1); }
                    }
                    return cols.length > 0 ? cols : ['Timeline'];
                });

                const getGanttAllBarStyle = (item, range) => {
                    if (!item || !item.startDate || !item.endDate) return { display: 'none' };
                    const s = ganttParseDate(item.startDate), e = ganttParseDate(item.endDate);
                    if (!s || !e) return { display: 'none' };
                    const totalMs = range.totalDays * 864e5;
                    const lp = Math.max(0, Math.min(100, ((s - range.start) / totalMs) * 100));
                    const wp = Math.max(2, Math.min(100 - lp, ((e - s) / totalMs) * 100));
                    return { left: lp.toFixed(2) + '%', width: wp.toFixed(2) + '%' };
                };

                const getTodayLineStyle = (range) => {
                    const today = new Date();
                    const lp = ((today - range.start) / (range.totalDays * 864e5)) * 100;
                    return (lp < 0 || lp > 100) ? { display: 'none' } : { left: lp.toFixed(2) + '%' };
                };

                // ─── PROJECT VIEWER & EDITOR ──────────────────────────
                const getStatusColor = (s) => {
                    if (s === 'COMPLETED')   return 'bg-emerald-500';
                    if (s === 'IN PROGRESS') return 'bg-blue-500';
                    if (s === 'STOPPED')     return 'bg-red-500';
                    return 'bg-slate-300';
                };
                const getStatusCycleColor = (s) => {
                    if (s === 'ON TRACK')  return 'bg-emerald-100 text-emerald-700';
                    if (s === 'DELAYED')   return 'bg-amber-100 text-amber-700';
                    if (s === 'AT RISK')   return 'bg-orange-100 text-orange-700';
                    if (s === 'ON HOLD')   return 'bg-slate-100 text-slate-500';
                    if (s === 'CANCELLED') return 'bg-red-50 text-red-400 line-through';
                    return 'bg-slate-100 text-slate-400';
                };

                const viewProjectDetails = (p) => {
                    selectedProject.value = JSON.parse(JSON.stringify(p));
                    activeViewerStage.value = 0;
                    detailsOpen.value = true;
                    viewMode.value = 'workflow';
                };

                // Always deep-clones before editing so changes don't affect the list until saved.
                // _localId is added to each stage/task so SortableJS can track them by identity.
                const openProjectEditor = (p) => {
                    editingType.value = 'project'; 
                    const cloned = JSON.parse(JSON.stringify(p));
                    cloned.stages.forEach(s => { 
                        s._localId = generateLocalId(); 
                        s.tasks = s.tasks || [];
                        s.tasks.forEach(t => t._localId = generateLocalId());
                    });
                    if(!cloned.finances) cloned.finances = { amount: null, unit: 'none', calculated: 0 };
                    
                    editingObject.value = cloned;
                    activeViewerStage.value = 0;
                    detailsOpen.value = false;
                    viewerOpen.value = true;
                };

                const openTemplateEditor = (t) => {
                    editingType.value = 'template';
                    const cloned = JSON.parse(JSON.stringify(t));
                    cloned.stages.forEach(s => { 
                        s._localId = generateLocalId(); 
                        s.tasks = s.tasks || [];
                        s.tasks.forEach(t => t._localId = generateLocalId());
                    });
                    editingObject.value = cloned;
                    activeViewerStage.value = 0;
                    viewerOpen.value = true;
                };

                // ─── PHASE STATUS AUTOMATION ──────────────────────────
                // Derives the automated status for a phase based on task completion.
                // Returns the current status unchanged when no tasks exist (no-op on empty phases).
                const computePhaseStatus = (stage) => {
                    const tasks = stage.tasks || [];
                    if (tasks.length === 0) return stage.status;
                    const done = tasks.filter(t => t.done).length;
                    if (done === 0) return 'PENDING';
                    if (done === tasks.length) return 'COMPLETED';
                    return 'IN PROGRESS';
                };

                // Walks all phases and applies computed status to any without a manual override.
                const recalcPhaseStatuses = (proj) => {
                    if (!proj || !proj.stages) return;
                    proj.stages.forEach(stage => {
                        if (!stage.statusOverride && (stage.tasks || []).length > 0)
                            stage.status = computePhaseStatus(stage);
                    });
                };

                // Returns true when the current GAS user matches the project owner.
                // Falls back to true (permissive) when running locally or owner is unset.
                const isCurrentUserOwner = (proj) => {
                    if (!proj || !proj.projectOwner) return true;
                    if (!currentUserEmail.value) return true;
                    const ownerName = proj.projectOwner.toLowerCase();
                    const localPart = currentUserEmail.value.toLowerCase().split('@')[0];
                    return localPart.split(/[._-]/).some(part => part.length > 2 && ownerName.includes(part));
                };

                // Called when the Project Owner confirms a manual override from the detail view.
                const overridePhaseStatus = (stage, proj) => {
                    stage.statusOverride = true;
                    silentSaveProject(proj);
                };

                // Resets a phase back to automated status calculation.
                const clearPhaseOverride = (stage, proj) => {
                    stage.statusOverride = false;
                    stage.status = computePhaseStatus(stage);
                    silentSaveProject(proj);
                };

                // Used for lightweight background saves (e.g. task checkbox toggle)
                // without going through the full save/complete flow.
                const silentSaveProject = (proj) => {
                    recalcPhaseStatuses(proj);
                    gsRun('saveProjectToSheet', [JSON.parse(JSON.stringify(proj))]);
                    const idx = projects.value.findIndex(x => x.id === proj.id);
                    if (idx > -1) projects.value[idx] = JSON.parse(JSON.stringify(proj));
                    if (selectedProject.value?.id === proj.id) selectedProject.value = JSON.parse(JSON.stringify(proj));
                };

                const confirmDeleteProject = async (p) => {
                    if (await showConfirm(`Permanently delete "${p.title}"? This cannot be undone.`)) {
                        projects.value = projects.value.filter(proj => proj.id !== p.id);
                        if (detailsOpen.value) detailsOpen.value = false;
                        gsRun('deleteProjectFromSheet', [p.id]);
                    }
                };

                const saveChanges = () => {
                    isSaving.value = true;
                    const toSave = JSON.parse(JSON.stringify(editingObject.value));
                    // _localId is only used client-side for drag-and-drop tracking, never persisted
                    toSave.stages.forEach(s => { delete s._localId; s.tasks.forEach(t => delete t._localId); });

                    if (typeof google !== 'undefined' && google.script) {
                        const fn = editingType.value === 'project' ? 'saveProjectToSheet' : 'saveTemplateToSheet';
                        gsRun(fn, [toSave], (savedObj) => completeSave(savedObj), (err) => { isSaving.value = false; showToast('Save failed: ' + err.message, 'error'); });
                    } else {
                        if(!toSave.code && editingType.value === 'project') toSave.code = "PRJ-MOCK";
                        setTimeout(() => completeSave(toSave), 500);
                    }
                };

                // Called on success from saveChanges.
                // Updates the list in place if it exists, or prepends if it's new.
                const completeSave = (savedObj) => {
                    isSaving.value = false;
                    const list = editingType.value === 'project' ? projects.value : templates.value;
                    const idx = list.findIndex(x => x.id === savedObj.id);
                    if (idx > -1) list[idx] = savedObj;
                    else list.unshift(savedObj);
                    
                    viewerOpen.value = false;
                    if (detailsOpen.value && editingType.value === 'project') {
                        selectedProject.value = savedObj;
                    }
                };

                const deleteStage = async (idx) => {
                    if(await showConfirm("Delete this phase?")) editingObject.value.stages.splice(idx, 1);
                };

                // ─── DATE HELPERS ─────────────────────────────────────
                // Mirrors DateService.formatDate — parses as UTC to avoid off-by-one day shifts.
                const formatDate = (d) => {
                    if(!d) return '--';
                    const dateObj = new Date(d + 'T00:00:00Z');
                    if (isNaN(dateObj.getTime())) return d;
                    return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
                };

                // Mirrors DateService.calculateDays — UTC to avoid timezone-based day miscounts.
                const calculateDays = (s, e) => {
                    if (!s || !e) return 0;
                    const start = new Date(s + 'T00:00:00Z');
                    const end   = new Date(e + 'T00:00:00Z');
                    return Math.max(0, Math.round((end - start) / 864e5));
                };

                const addStage = () => {
                    editingObject.value.stages.push({ _localId: generateLocalId(), title: 'NEW PHASE', status: 'PENDING', icon: 'fa-tasks', assignee: '', tasks: [], startDate: '', endDate: '' });
                    activeViewerStage.value = editingObject.value.stages.length - 1;
                };

                const addSuggestedStage = (sug) => {
                    editingObject.value.stages.push({ _localId: generateLocalId(), title: sug.title, status: 'PENDING', icon: sug.icon, assignee: '', tasks: [], startDate: '', endDate: '' });
                    activeViewerStage.value = editingObject.value.stages.length - 1;
                };

                const addTask = () => {
                    if(!editingObject.value.stages[activeViewerStage.value].tasks) editingObject.value.stages[activeViewerStage.value].tasks = [];
                    editingObject.value.stages[activeViewerStage.value].tasks.push({ _localId: generateLocalId(), desc: '', done: false, alert: false, alertComment: '', comment: '', assignee: '', startDate:'', endDate:'' });
                };

                // ─── TEMPLATES & CREATE ACTIONS ───────────────────────
                // Scaffolds a blank project with a default BRIEFING phase.
                const createNewProject = () => {
                    editingType.value = 'project';
                    editingObject.value = { 
                        id: Date.now(), title: 'New Project', folder: 'Uncategorized', code: '', category: '', detail: '', reason: '', generalComments: '', icon: 'fa-rocket', driveRootUrl: '', chatWebhook: '',
                        finances: { amount: null, unit: 'none', calculated: 0 },
                        stages: [{ _localId: generateLocalId(), title: 'BRIEFING', status: 'PENDING', icon: 'fa-clipboard-list', assignee: '', tasks: [], startDate: '', endDate: '' }], 
                        projectOwner: '', cycleStatus: 'ON TRACK', archived: false 
                    };
                    activeViewerStage.value = 0;
                    viewerOpen.value = true;
                };

                const createNewTemplate = () => {
                    editingType.value = 'template';
                    editingObject.value = { id: Date.now(), name: 'New Template', description: '', stages: [] };
                    viewerOpen.value = true;
                };

                // Clones a template's stages into a new project object.
                // The template itself is not modified.
                const createProjectFromTemplate = (t) => {
                    editingType.value = 'project';
                    const cloned = JSON.parse(JSON.stringify(t));
                    cloned.stages.forEach(s => { 
                        s._localId = generateLocalId(); 
                        s.tasks = s.tasks || [];
                        s.tasks.forEach(t => t._localId = generateLocalId());
                    });
                    
                    editingObject.value = { 
                        id: Date.now(), title: 'Project from ' + t.name, folder: 'Uncategorized', code: '', category: '', detail: '', reason: '', generalComments: '', icon: 'fa-box', driveRootUrl: '', chatWebhook: '',
                        finances: { amount: null, unit: 'none', calculated: 0 },
                        stages: cloned.stages, projectOwner: '', cycleStatus: 'ON TRACK', archived: false 
                    };
                    activeViewerStage.value = 0;
                    viewerOpen.value = true;
                    currentView.value = 'dashboard';
                };

                const deleteTemplate = async (id) => {
                    if(!await showConfirm('Delete this template?')) return;
                    gsRun('deleteTemplateFromSheet', [id]);
                    templates.value = templates.value.filter(t => t.id !== id);
                };

                const toggleArchive = (p) => {
                    p.archived = !p.archived;
                    gsRun('saveProjectToSheet', [JSON.parse(JSON.stringify(p))]);
                };

                // ─── EXPORT ───────────────────────────────────────────
                // Grabs a DOM element by ID and exports it as PDF or PNG.
                // html2pdf and html2canvas are loaded via CDN in index.html.
                const exportView = (type, elementId) => {
                    const element = document.getElementById(elementId);
                    if(!element) return;
                    const opt = {
                        margin: 0.5,
                        filename: `PackTrack_Export_${Date.now()}.${type === 'pdf' ? 'pdf' : 'png'}`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
                    };

                    if (type === 'pdf') html2pdf().set(opt).from(element).save();
                    else if (type === 'image') {
                        html2canvas(element, opt.html2canvas).then(canvas => {
                            const link = document.createElement('a');
                            link.download = opt.filename;
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                        });
                    }
                };
                
                return {
                    collapsed, currentView, viewTitle, viewMode, searchQuery, viewerOpen, detailsOpen, editingType, editingObject, selectedProject, activeViewerStage, menuItems,
                    projects, templates, filteredProjects, filteredTemplates, dashShowArchived, dbShowArchived, stats, activeProjectsList, executiveSummary, iconOptions, config,
                    newCpMember, newExternalMember, newSuggestion, saveConfig, addTeamMember, removeTeamMember, addSuggestedPhase, removeSuggestedPhase,
                    filterStatus, filterOwner, filterFolder, sortBy, ganttScale, ganttGridColumns, ganttProjectId, ganttViewMode, ganttFilterCategory, ganttFilterOwner, ganttFilterStatus, ganttVisibleProjects, ganttCategories, ganttOwners, ganttAllDateRange, ganttAllGridColumns, getGanttAllBarStyle, getProjectColor, getTodayLineStyle, projectsByFolder, folderState, customFolders, toggleFolder, createNewFolder, deleteFolder, handleMoveFolder, getProjectAlerts, getFolderKPI,
                    dialog, dialogConfirm, dialogCancel,
                    phasesSortableRef, tasksSortableRef, toggleDictation, isDictating, dictationState, toast, showToast, sendChat,
                    isDriveLoading, driveDragActive, driveFiles, driveFolders, extractDriveId, fetchDriveContents, createDriveSubFolder, deleteDriveItem, handleDriveDrop, getFileIcon,
                    getStatusColor, getStatusCycleColor, viewProjectDetails, openProjectEditor, openTemplateEditor, silentSaveProject, confirmDeleteProject, createNewProject, createNewTemplate, saveChanges, fetchData, isRefreshing, isSaving, calculateFinance, formatFinance,
                    calculateProgress, getCurrentPhase, formatDate, addStage, addSuggestedStage, addTask, deleteStage, createProjectFromTemplate, toggleArchive, getGanttBarStyle, calculateDays, deleteTemplate, exportView,
                    currentUserEmail, computePhaseStatus, isCurrentUserOwner, overridePhaseStatus, clearPhaseOverride
                };
            }
        }).mount('#app');