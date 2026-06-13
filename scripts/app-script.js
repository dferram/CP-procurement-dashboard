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
                const { currentUserEmail, userInitials, isOwnerCheck, isCollaboratorCheck } = useAuth();
                // ─── BRAND LOGOS (injected by index.html via GAS scriptlet) ──
                const logoWhite = ref(typeof LOGO_WHITE_URL !== 'undefined' ? LOGO_WHITE_URL : '');
                const logoBlue  = ref(typeof LOGO_BLUE_URL  !== 'undefined' ? LOGO_BLUE_URL  : '');

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
                const driveFileInputRef = ref(null);
                const activeDriveFolderId = computed(() =>
                    viewerOpen.value ? editingObject.value?.driveFolderId : selectedProject.value?.driveFolderId
                );

                // ─── FILTER & SORT STATE ──────────────────────────────────
                const filterStatus  = ref('ALL');
                const filterOwner  = ref('ALL');
                const filterFolder = ref('ALL');
                const filterProject = ref('ALL');
                const sortBy = ref('date_desc');

                // ─── GANTT STATE ──────────────────────────────────────────
                const ganttScale = ref('daily');
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
                    if (currentView.value === 'summary') nextTick(initCharts);
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

                watch([viewMode, detailsOpen], ([newMode, isOpen]) => {
                    if (newMode === 'files' && isOpen && selectedProject.value?.driveFolderId) {
                        fetchDriveContents(selectedProject.value.driveFolderId);
                    }
                });

                const createDriveSubFolder = async () => {
                    const name = await showPrompt("Enter subfolder name:");
                    if(!name || name.trim()==='') return;
                    const fid = activeDriveFolderId.value;
                    isDriveLoading.value = true;
                    gsRun('createDriveSubFolder', [fid, name.trim()], () => fetchDriveContents(fid));
                };

                const deleteDriveItem = async (id, isFolder) => {
                    if(!await showConfirm(`Delete this ${isFolder ? 'folder' : 'file'}?`)) return;
                    const fid = activeDriveFolderId.value;
                    isDriveLoading.value = true;
                    gsRun('deleteDriveItem', [id, isFolder], () => fetchDriveContents(fid));
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
                        const fid = activeDriveFolderId.value;
                        gsRun('uploadFileToDrive', [fid, base64, file.name, file.type], () => fetchDriveContents(fid));
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

                const addTeamMember = (listKey, inputStr) => {
                    const val = (inputStr || '').trim();
                    if (!val) return;
                    
                    if (listKey === 'cpTeam') {
                        // Basic email to name extraction
                        let namePart = val.split('@')[0];
                        namePart = namePart.replace(/^bp_/, '');
                        const parts = namePart.split(/[._-]/).filter(p => p.length > 0);
                        const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
                        
                        config.value.cpTeam.push({ name: name || val, email: val });
                        newCpMember.value = '';
                    } else {
                        // External team are just strings (e.g. Suppliers)
                        config.value.externalTeam.push(val);
                        newExternalMember.value = '';
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
                    if (filterStatus.value  !== 'ALL') res = res.filter(p => p.cycleStatus === filterStatus.value);
                    if (filterOwner.value   !== 'ALL') res = res.filter(p => p.projectOwner === filterOwner.value || (!p.projectOwner && filterOwner.value === 'Unassigned'));
                    if (filterFolder.value  !== 'ALL') res = res.filter(p => (p.folder || 'Uncategorized') === filterFolder.value);
                    if (filterProject.value !== 'ALL') res = res.filter(p => String(p.id) === String(filterProject.value));

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

                // ─── PROCUREMENT ANALYTICS (Executive Summary) ────────
                const chartStatusRef   = ref(null);
                const chartBudgetRef   = ref(null);
                const chartPhaseRef    = ref(null);
                const chartOwnerRef    = ref(null);
                const chartProgressRef = ref(null);
                const chartInstances   = {};

                const procurementStats = computed(() => {
                    const active = filteredProjects.value.filter(p => !p.archived);
                    const onTrackCount = active.filter(p => p.cycleStatus === 'ON TRACK').length;
                    const pctOnTime = active.length ? Math.round((onTrackCount / active.length) * 100) : 0;
                    let investment = 0, savings = 0;
                    active.forEach(p => {
                        if (p.finances?.calculated) {
                            if (p.finances.calculated > 0) investment += p.finances.calculated;
                            else savings += Math.abs(p.finances.calculated);
                        }
                    });
                    const openAlerts = active.reduce((acc, p) => acc + getProjectAlerts(p), 0);
                    const avgProgress = active.length ? Math.round(active.reduce((s, p) => s + calculateProgress(p), 0) / active.length) : 0;
                    return { activeCount: active.length, pctOnTime, investment, savings, openAlerts, avgProgress };
                });

                const summaryStatusData = computed(() => {
                    const active = filteredProjects.value.filter(p => !p.archived);
                    return {
                        labels: ['ON TRACK','DELAYED','AT RISK','CANCELLED'],
                        values: [
                            active.filter(p => p.cycleStatus === 'ON TRACK').length,
                            active.filter(p => p.cycleStatus === 'DELAYED').length,
                            active.filter(p => p.cycleStatus === 'AT RISK').length,
                            active.filter(p => p.cycleStatus === 'CANCELLED').length,
                        ]
                    };
                });

                const summaryBudgetByFolder = computed(() =>
                    customFolders.value.map(folder => {
                        const fps = filteredProjects.value.filter(p => (p.folder || 'Uncategorized') === folder && !p.archived);
                        const investment = fps.filter(p => p.finances?.calculated > 0).reduce((s, p) => s + p.finances.calculated, 0);
                        const savings    = fps.filter(p => p.finances?.calculated < 0).reduce((s, p) => s + Math.abs(p.finances.calculated), 0);
                        return { folder, investment, savings };
                    })
                );

                const summaryProjectsByPhase = computed(() => {
                    const counts = {};
                    filteredProjects.value.filter(p => !p.archived).forEach(p => {
                        const phase = getCurrentPhase(p);
                        counts[phase] = (counts[phase] || 0) + 1;
                    });
                    return counts;
                });

                const summaryProjectsByOwner = computed(() => {
                    const counts = {};
                    filteredProjects.value.filter(p => !p.archived).forEach(p => {
                        const owner = p.projectOwner || 'Unassigned';
                        counts[owner] = (counts[owner] || 0) + 1;
                    });
                    return counts;
                });

                const summaryProgressPerProject = computed(() =>
                    filteredProjects.value
                        .filter(p => !p.archived)
                        .map(p => ({ label: p.code || p.title, progress: calculateProgress(p), status: p.cycleStatus }))
                        .sort((a, b) => b.progress - a.progress)
                );

                const selectedProjectObj = computed(() =>
                    filterProject.value !== 'ALL'
                        ? projects.value.find(p => String(p.id) === String(filterProject.value)) || null
                        : null
                );

                const projectPhaseStatusData = computed(() => {
                    const p = selectedProjectObj.value;
                    if (!p?.stages) return { labels: [], values: [] };
                    const counts = {};
                    p.stages.forEach(s => { const st = s.status || 'Pending'; counts[st] = (counts[st] || 0) + 1; });
                    return { labels: Object.keys(counts), values: Object.values(counts) };
                });

                const projectPhaseProgress = computed(() => {
                    const p = selectedProjectObj.value;
                    if (!p?.stages) return [];
                    return p.stages.map(s => {
                        const tasks = s.tasks || [];
                        const done = tasks.filter(t => t.done).length;
                        const total = tasks.length;
                        const progress = total > 0 ? Math.round((done / total) * 100) : (s.status === 'COMPLETE' || s.status === 'DONE' ? 100 : 0);
                        return { label: s.title, progress, status: s.status, alerts: tasks.filter(t => t.alert).length };
                    });
                });

                const projectTasksData = computed(() => {
                    const p = selectedProjectObj.value;
                    if (!p?.stages) return { done: 0, pending: 0, alert: 0 };
                    let done = 0, pending = 0, alert = 0;
                    p.stages.forEach(s => (s.tasks || []).forEach(t => { if (t.done) done++; else if (t.alert) alert++; else pending++; }));
                    return { done, pending, alert };
                });

                const chartTitles = computed(() => {
                    const ip = filterProject.value !== 'ALL';
                    return {
                        status:   ip ? 'Fases por Status'           : 'Portfolio Status Distribution',
                        budget:   ip ? 'Progreso por Fase'           : 'Budget by Category',
                        phase:    ip ? 'Resumen de Tareas'            : 'Projects by Current Phase',
                        owner:    ip ? 'Alertas Activas por Fase'     : 'Workload by Owner',
                        progress: ip ? 'Desglose de Tareas por Fase'  : 'Individual Project Progress',
                    };
                });

                const insights = computed(() => {
                    if (filterProject.value !== 'ALL') {
                        const p = selectedProjectObj.value;
                        if (!p) return [];
                        const list = [];
                        const progress = calculateProgress(p);
                        const phase = getCurrentPhase(p);
                        const alertCount = getProjectAlerts(p);
                        const stages = p.stages || [];
                        const doneStages = stages.filter(s => s.status === 'COMPLETE' || s.status === 'DONE').length;
                        const noDateStages = stages.filter(s => !s.startDate || !s.endDate).length;
                        const allTasks = stages.flatMap(s => s.tasks || []);
                        const doneTasks = allTasks.filter(t => t.done).length;
                        list.push({ type: progress >= 75 ? 'success' : progress >= 40 ? 'info' : 'warning', text: `Progreso: ${progress}% — Fase activa: ${phase}` });
                        if (p.cycleStatus === 'DELAYED' || p.cycleStatus === 'AT RISK') list.push({ type: 'warning', text: `Proyecto en estado ${p.cycleStatus}` });
                        if (alertCount > 0) list.push({ type: 'error', text: `${alertCount} tarea(s) con alerta activa` });
                        list.push({ type: 'info', text: `${doneTasks} de ${allTasks.length} tareas completadas — ${doneStages} de ${stages.length} fases finalizadas` });
                        if (noDateStages > 0) list.push({ type: 'info', text: `${noDateStages} fase(s) sin fechas de inicio/fin` });
                        if (!p.projectOwner) list.push({ type: 'info', text: 'Sin responsable asignado al proyecto' });
                        return list;
                    }
                    const active = filteredProjects.value.filter(p => !p.archived);
                    const atRisk = active.filter(p => p.cycleStatus === 'DELAYED' || p.cycleStatus === 'AT RISK').length;
                    const openAlerts = active.reduce((acc, p) => acc + getProjectAlerts(p), 0);
                    const noOwner = active.filter(p => !p.projectOwner).length;
                    const noDates = active.filter(p => p.stages?.some(s => !s.startDate)).length;
                    const avgProgress = active.length ? Math.round(active.reduce((s, p) => s + calculateProgress(p), 0) / active.length) : 0;
                    const list = [];
                    if (atRisk > 0)       list.push({ type: 'warning', text: `${atRisk} proyecto(s) DELAYED o AT RISK requieren atención` });
                    if (openAlerts > 0)   list.push({ type: 'error',   text: `${openAlerts} tarea(s) con alerta activa sin resolver` });
                    if (noOwner > 0)      list.push({ type: 'info',    text: `${noOwner} proyecto(s) sin responsable asignado` });
                    if (noDates > 0)      list.push({ type: 'info',    text: `${noDates} proyecto(s) con fases sin cronograma` });
                    if (avgProgress > 75) list.push({ type: 'success', text: `Portafolio en etapa avanzada — ${avgProgress}% de progreso promedio` });
                    return list;
                });

                const destroyCharts = () => {
                    ['status','budget','phase','owner','progress'].forEach(k => {
                        if (chartInstances[k]) { chartInstances[k].destroy(); chartInstances[k] = null; }
                    });
                };

                const initCharts = () => {
                    destroyCharts();
                    if (typeof Chart === 'undefined') return;
                    const ownerPalette = ['#0047BB','#10b981','#f59e0b','#f97316','#8b5cf6','#06b6d4'];
                    const statusMap = { 'ON TRACK':'#10b981','DELAYED':'#f59e0b','AT RISK':'#f97316','CANCELLED':'#ef4444','ON HOLD':'#94a3b8','COMPLETED':'#10b981','COMPLETE':'#10b981','IN PROGRESS':'#3b82f6','PENDING':'#8b5cf6','DONE':'#0047BB','STOPPED':'#ef4444' };
                    if (filterProject.value !== 'ALL') {
                        // ── PROJECT MODE ──────────────────────────────────
                        if (chartStatusRef.value) {
                            const psd = projectPhaseStatusData.value;
                            chartInstances.status = new Chart(chartStatusRef.value, { type:'doughnut', data:{ labels:psd.labels, datasets:[{ data:psd.values, backgroundColor:psd.labels.map(l=>statusMap[l]||'#94a3b8'), borderWidth:2, borderColor:'#fff' }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11, weight:'700' }, padding:14 } } } } });
                        }
                        if (chartBudgetRef.value) {
                            const pp = projectPhaseProgress.value;
                            chartInstances.budget = new Chart(chartBudgetRef.value, { type:'bar', data:{ labels:pp.map(p=>p.label), datasets:[{ label:'% Completado', data:pp.map(p=>p.progress), backgroundColor:pp.map(p=>statusMap[p.status]||'#0047BB'), borderRadius:4 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ min:0, max:100, ticks:{ callback:v=>v+'%', font:{ size:10 } } }, y:{ ticks:{ font:{ size:10 } } } } } });
                        }
                        if (chartPhaseRef.value) {
                            const td = projectTasksData.value;
                            chartInstances.phase = new Chart(chartPhaseRef.value, { type:'doughnut', data:{ labels:['Completadas','Pendientes','Con Alerta'], datasets:[{ data:[td.done,td.pending,td.alert], backgroundColor:['#10b981','#3b82f6','#ef4444'], borderWidth:2, borderColor:'#fff' }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11, weight:'700' }, padding:14 } } } } });
                        }
                        if (chartOwnerRef.value) {
                            const pp = projectPhaseProgress.value;
                            chartInstances.owner = new Chart(chartOwnerRef.value, { type:'bar', data:{ labels:pp.map(p=>p.label), datasets:[{ label:'Alertas', data:pp.map(p=>p.alerts), backgroundColor:'#ef4444', borderRadius:4 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ stepSize:1, font:{ size:10 } } }, y:{ ticks:{ font:{ size:10 } } } } } });
                        }
                        if (chartProgressRef.value) {
                            const p = selectedProjectObj.value;
                            const phases = (p?.stages||[]).map(s => { const t=s.tasks||[]; return { label:s.title, done:t.filter(x=>x.done).length, alert:t.filter(x=>x.alert&&!x.done).length, pending:t.filter(x=>!x.done&&!x.alert).length }; });
                            chartInstances.progress = new Chart(chartProgressRef.value, { type:'bar', data:{ labels:phases.map(ph=>ph.label), datasets:[{ label:'Completadas', data:phases.map(ph=>ph.done), backgroundColor:'#10b981' },{ label:'Pendientes', data:phases.map(ph=>ph.pending), backgroundColor:'#3b82f6' },{ label:'Con Alerta', data:phases.map(ph=>ph.alert), backgroundColor:'#ef4444' }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:10 } } } }, scales:{ x:{ stacked:true, ticks:{ stepSize:1, font:{ size:10 } } }, y:{ stacked:true, ticks:{ font:{ size:10 } } } } } });
                        }
                    } else {
                        // ── PORTFOLIO MODE ────────────────────────────────
                        if (chartStatusRef.value) {
                            const sd = summaryStatusData.value;
                            chartInstances.status = new Chart(chartStatusRef.value, { type:'doughnut', data:{ labels:sd.labels, datasets:[{ data:sd.values, backgroundColor:['#10b981','#f59e0b','#f97316','#ef4444'], borderWidth:2, borderColor:'#fff' }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11, weight:'700' }, padding:14 } } } } });
                        }
                        if (chartBudgetRef.value) {
                            const bd = summaryBudgetByFolder.value;
                            chartInstances.budget = new Chart(chartBudgetRef.value, { type:'bar', data:{ labels:bd.map(d=>d.folder), datasets:[{ label:'Investment', data:bd.map(d=>d.investment), backgroundColor:'#0047BB' },{ label:'Savings', data:bd.map(d=>d.savings), backgroundColor:'#10b981' }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:10 } } } }, scales:{ x:{ ticks:{ font:{ size:10 } } }, y:{ ticks:{ font:{ size:10 } } } } } });
                        }
                        if (chartPhaseRef.value) {
                            const pd = summaryProjectsByPhase.value;
                            chartInstances.phase = new Chart(chartPhaseRef.value, { type:'bar', data:{ labels:Object.keys(pd), datasets:[{ label:'Projects', data:Object.values(pd), backgroundColor:'#0047BB', borderRadius:4 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ stepSize:1, font:{ size:10 } } }, x:{ ticks:{ font:{ size:10 }, maxRotation:40 } } } } });
                        }
                        if (chartOwnerRef.value) {
                            const od = summaryProjectsByOwner.value;
                            const labels = Object.keys(od);
                            chartInstances.owner = new Chart(chartOwnerRef.value, { type:'bar', data:{ labels, datasets:[{ label:'Projects', data:Object.values(od), backgroundColor:labels.map((_,i)=>ownerPalette[i%ownerPalette.length]), borderRadius:4 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ stepSize:1, font:{ size:10 } } }, y:{ ticks:{ font:{ size:10 } } } } } });
                        }
                        if (chartProgressRef.value) {
                            const pp = summaryProgressPerProject.value;
                            chartInstances.progress = new Chart(chartProgressRef.value, { type:'bar', data:{ labels:pp.map(p=>p.label), datasets:[{ label:'% Progress', data:pp.map(p=>p.progress), backgroundColor:pp.map(p=>statusMap[p.status]||'#0047BB'), borderRadius:4 }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ min:0, max:100, ticks:{ callback:v=>v+'%', font:{ size:10 } } }, y:{ ticks:{ font:{ size:10 } } } } } });
                        }
                    }
                };

                watch(currentView, (nv, ov) => {
                    if (ov === 'summary') destroyCharts();
                    if (nv === 'summary') nextTick(initCharts);
                });

                watch(filteredProjects, () => {
                    if (currentView.value === 'summary') nextTick(initCharts);
                });

                // ─── GANTT ────────────────────────────────────────────
                // Shared date parser — always UTC (T00:00:00Z) to match DateService._parseDate on the backend.
                const ganttParseDate = (str) => {
                    const d = new Date(str + 'T00:00:00Z');
                    if (isNaN(d.getTime())) return null;
                    const yr = d.getUTCFullYear();
                    return (yr < 2000 || yr > 2100) ? null : d;
                };

                // Mirrors DateService.getProjectDateRange — extracts all stage+task dates,
                // picks min/max, then adds a 7-day buffer on each side.
                const projectDateRange = computed(() => {
                    const stages = selectedProject.value?.stages;
                    let mn = null, mx = null;
                    if (!stages || stages.length === 0) {
                        mn = new Date();
                        mx = new Date(mn.getTime() + 30 * 864e5);
                    } else {
                        const ts = [];
                        stages.forEach(s => {
                            if (s.startDate) { const d = ganttParseDate(s.startDate); if (d) ts.push(d.getTime()); }
                            if (s.endDate)   { const d = ganttParseDate(s.endDate);   if (d) ts.push(d.getTime()); }
                            (s.tasks || []).forEach(t => {
                                if (t.startDate) { const d = ganttParseDate(t.startDate); if (d) ts.push(d.getTime()); }
                                if (t.endDate)   { const d = ganttParseDate(t.endDate);   if (d) ts.push(d.getTime()); }
                            });
                        });
                        if (ts.length === 0) {
                            mn = new Date();
                            mx = new Date(mn.getTime() + 30 * 864e5);
                        } else {
                            mn = new Date(Math.min(...ts));
                            mx = new Date(Math.max(...ts));
                            if (mx.getTime() - mn.getTime() < 15 * 864e5) {
                                mx = new Date(mn.getTime() + 15 * 864e5);
                            } else {
                                mx = new Date(mx.getTime() + 2 * 864e5); // Small buffer
                            }
                        }
                    }

                    const scale = ganttScale.value;
                    let start = new Date(mn);
                    let end = new Date(mx);
                    start.setUTCHours(0,0,0,0);
                    end.setUTCHours(0,0,0,0);

                    if (scale === 'weekly') {
                        const day = start.getUTCDay();
                        start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day));
                        const endDay = end.getUTCDay();
                        end.setUTCDate(end.getUTCDate() + (endDay === 0 ? 0 : 7 - endDay));
                    } else if (scale === 'monthly' || scale === 'yearly') {
                        start.setUTCDate(1);
                        end.setUTCMonth(end.getUTCMonth() + 1);
                        end.setUTCDate(0);
                    }

                    let totalDays = Math.max(1, Math.round((end - start) / 864e5) + 1);
                    if (totalDays > 1000) {
                        totalDays = 1000;
                        end = new Date(start.getTime() + (totalDays - 1) * 864e5);
                    }
                    return { start, end, totalDays };
                });

                // Mirrors GanttService.generateGridColumns — weekly/monthly/yearly column labels.
                const ganttGridColumns = computed(() => {
                    const { start, end } = projectDateRange.value;
                    const cols = [];
                    if (ganttScale.value === 'daily') {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.getUTCDate() + '/' + (curr.getUTCMonth()+1));
                            curr.setUTCDate(curr.getUTCDate() + 1);
                        }
                    } else if (ganttScale.value === 'weekly') {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.getUTCDate() + '/' + (curr.getUTCMonth()+1));
                            curr.setUTCDate(curr.getUTCDate() + 7);
                        }
                    } else {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
                            curr.setUTCMonth(curr.getUTCMonth() + 1);
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
                    const widthPct = Math.max(2, Math.min(100 - leftPct, ((end - start + 864e5) / totalMs) * 100));
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
                    let mn = null, mx = null;
                    if (!all.length) {
                        mn = new Date();
                        mx = new Date(mn.getTime() + 30*864e5);
                    } else {
                        const ts = [];
                        all.forEach(p => (p.stages || []).forEach(s => {
                            if (s.startDate) { const d = ganttParseDate(s.startDate); if (d) ts.push(d.getTime()); }
                            if (s.endDate)   { const d = ganttParseDate(s.endDate);   if (d) ts.push(d.getTime()); }
                            (s.tasks || []).forEach(t => {
                                if (t.startDate) { const d = ganttParseDate(t.startDate); if (d) ts.push(d.getTime()); }
                                if (t.endDate)   { const d = ganttParseDate(t.endDate);   if (d) ts.push(d.getTime()); }
                            });
                        }));
                        if (!ts.length) {
                            mn = new Date();
                            mx = new Date(mn.getTime() + 30*864e5);
                        } else {
                            mn = new Date(Math.min(...ts));
                            mx = new Date(Math.max(...ts));
                            if (mx.getTime() - mn.getTime() < 15 * 864e5) {
                                mx = new Date(mn.getTime() + 15 * 864e5);
                            } else {
                                mx = new Date(mx.getTime() + 2 * 864e5); // Small buffer
                            }
                        }
                    }

                    const scale = ganttScale.value;
                    let start = new Date(mn);
                    let end = new Date(mx);
                    start.setUTCHours(0,0,0,0);
                    end.setUTCHours(0,0,0,0);

                    if (scale === 'weekly') {
                        const day = start.getUTCDay();
                        start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day));
                        const endDay = end.getUTCDay();
                        end.setUTCDate(end.getUTCDate() + (endDay === 0 ? 0 : 7 - endDay));
                    } else if (scale === 'monthly' || scale === 'yearly') {
                        start.setUTCDate(1);
                        end.setUTCMonth(end.getUTCMonth() + 1);
                        end.setUTCDate(0);
                    }

                    let totalDays = Math.max(1, Math.round((end - start) / 864e5) + 1);
                    if (totalDays > 1000) {
                        totalDays = 1000;
                        end = new Date(start.getTime() + (totalDays - 1) * 864e5);
                    }
                    return { start, end, totalDays };
                });

                const ganttGridMinWidth = computed(() => {
                    const days = ganttAllDateRange.value.totalDays;
                    if (ganttScale.value === 'daily') return Math.max(100, days * 60) + 'px';
                    if (ganttScale.value === 'weekly') return Math.max(100, (days / 7) * 120) + 'px';
                    return Math.max(100, (days / 30) * 150) + 'px'; 
                });

                const ganttAllGridColumns = computed(() => {
                    const { start, end } = ganttAllDateRange.value;
                    const cols = [];
                    if (ganttScale.value === 'daily') {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.getUTCDate() + '/' + (curr.getUTCMonth()+1));
                            curr.setUTCDate(curr.getUTCDate() + 1);
                        }
                    } else if (ganttScale.value === 'weekly') {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.getUTCDate() + '/' + (curr.getUTCMonth()+1));
                            curr.setUTCDate(curr.getUTCDate() + 7);
                        }
                    } else {
                        let curr = new Date(start);
                        while (curr <= end && cols.length < 1000) {
                            cols.push(curr.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
                            curr.setUTCMonth(curr.getUTCMonth() + 1);
                        }
                    }
                    return cols.length > 0 ? cols : ['Timeline'];
                });

                const getGanttAllBarStyle = (item, range) => {
                    if (!item || !item.startDate || !item.endDate) return { display: 'none' };
                    const s = ganttParseDate(item.startDate), e = ganttParseDate(item.endDate);
                    if (!s || !e) return { display: 'none' };
                    const totalMs = range.totalDays * 864e5;
                    const lp = Math.max(0, Math.min(100, ((s - range.start) / totalMs) * 100));
                    const wp = Math.max(2, Math.min(100 - lp, ((e - s + 864e5) / totalMs) * 100));
                    return { left: lp.toFixed(2) + '%', width: wp.toFixed(2) + '%' };
                };

                const getTodayLineStyle = (range) => {
                    const today = new Date();
                    const lp = ((today - range.start) / (range.totalDays * 864e5)) * 100;
                    return (lp < 0 || lp > 100) ? { display: 'none' } : { left: lp.toFixed(2) + '%' };
                };

                // ─── PROJECT VIEWER & EDITOR ──────────────────────────
                const getStatusColor = (s) => {
                    if (s === 'COMPLETED' || s === 'Done')   return 'bg-emerald-500';
                    if (s === 'IN PROGRESS' || s === 'Active') return 'bg-blue-500';
                    if (s === 'STOPPED' || s === 'Stopped')     return 'bg-red-500';
                    if (s === 'PENDING' || s === 'Pending')     return 'bg-purple-400';
                    return 'bg-slate-300';
                };
                const getStatusCycleColor = (s) => {
                    if (s === 'ON TRACK')  return 'background:#D1FAE5;color:#065F46;';
                    if (s === 'DELAYED')   return 'background:#FEF3C7;color:#92400E;';
                    if (s === 'AT RISK')   return 'background:#FFEDD5;color:#9A3412;';
                    if (s === 'ON HOLD')   return 'background:#F1F5F9;color:#64748B;';
                    if (s === 'CANCELLED') return 'background:#FEF2F2;color:#B91C1C;text-decoration:line-through;';
                    return 'background:#F1F5F9;color:#94A3B8;';
                };

                const quickSaveCycleStatus = (newStatus) => {
                    selectedProject.value.cycleStatus = newStatus;
                    silentSaveProject(selectedProject.value);
                };

                const toggleTaskAlert = (task) => {
                    task.alert = !task.alert;
                    if (!task.alert) task.alertComment = '';
                    silentSaveProject(selectedProject.value);
                };

                const triggerDriveUpload = () => {
                    if (driveFileInputRef.value) driveFileInputRef.value.click();
                };

                const handleFileInputUpload = (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    const fid = activeDriveFolderId.value;
                    if (!fid) { showToast('No Drive folder linked to this project.', 'error'); return; }
                    const reader = new FileReader();
                    isDriveLoading.value = true;
                    reader.onload = (ev) => {
                        gsRun('uploadFileToDrive', [fid, ev.target.result, file.name, file.type], () => fetchDriveContents(fid));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
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

                // Auth methods extracted to useAuth()

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

                const formatGanttDuration = (s, e) => {
                    if (!s || !e) return '';
                    const start = new Date(s + 'T00:00:00Z');
                    const end   = new Date(e + 'T00:00:00Z');
                    let days = Math.max(1, Math.round((end - start) / 864e5));
                    
                    if (ganttScale.value === 'weekly') {
                        const w = Math.max(1, Math.round(days / 7));
                        return w + (w === 1 ? ' week' : ' weeks');
                    } else if (ganttScale.value === 'monthly' || ganttScale.value === 'yearly') {
                        const m = Math.max(1, Math.round(days / 30));
                        return m + (m === 1 ? ' month' : ' months');
                    }
                    return days + (days === 1 ? ' day' : ' days');
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
                        projectOwner: '', ownerEmail: currentUserEmail.value || '', collaboratorEmails: [], cycleStatus: 'ON TRACK', archived: false 
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
                        stages: cloned.stages, projectOwner: '', ownerEmail: currentUserEmail.value || '', collaboratorEmails: [], cycleStatus: 'ON TRACK', archived: false 
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
                    procurementStats, summaryStatusData, summaryBudgetByFolder, summaryProjectsByPhase, summaryProjectsByOwner, summaryProgressPerProject, insights,
                    selectedProjectObj, projectPhaseStatusData, projectPhaseProgress, projectTasksData, chartTitles,
                    chartStatusRef, chartBudgetRef, chartPhaseRef, chartOwnerRef, chartProgressRef,
                    newCpMember, newExternalMember, newSuggestion, saveConfig, addTeamMember, removeTeamMember, addSuggestedPhase, removeSuggestedPhase,
                    filterStatus, filterOwner, filterFolder, filterProject, sortBy, ganttScale, ganttGridColumns, ganttProjectId, ganttViewMode, ganttFilterCategory, ganttFilterOwner, ganttFilterStatus, ganttVisibleProjects, ganttCategories, ganttOwners, ganttAllDateRange, ganttGridMinWidth, ganttAllGridColumns, getGanttAllBarStyle, getProjectColor, getTodayLineStyle, projectsByFolder, folderState, customFolders, toggleFolder, createNewFolder, deleteFolder, handleMoveFolder, getProjectAlerts, getFolderKPI,
                    dialog, dialogConfirm, dialogCancel,
                    phasesSortableRef, tasksSortableRef, toggleDictation, isDictating, dictationState, toast, showToast, sendChat,
                    isDriveLoading, driveDragActive, driveFiles, driveFolders, extractDriveId, fetchDriveContents, createDriveSubFolder, deleteDriveItem, handleDriveDrop, getFileIcon,
                    getStatusColor, getStatusCycleColor, viewProjectDetails, openProjectEditor, openTemplateEditor, silentSaveProject, confirmDeleteProject, createNewProject, createNewTemplate, saveChanges, fetchData, isRefreshing, isSaving, calculateFinance, formatFinance,
                    calculateProgress, getCurrentPhase, formatDate, addStage, addSuggestedStage, addTask, deleteStage, createProjectFromTemplate, toggleArchive, getGanttBarStyle, calculateDays, formatGanttDuration, deleteTemplate, exportView,
                    currentUserEmail, userInitials, computePhaseStatus, isOwnerCheck, isCollaboratorCheck, overridePhaseStatus, clearPhaseOverride,
                    quickSaveCycleStatus, toggleTaskAlert, triggerDriveUpload, handleFileInputUpload, driveFileInputRef,
                    logoWhite, logoBlue
                };
            }
        }).mount('#app');