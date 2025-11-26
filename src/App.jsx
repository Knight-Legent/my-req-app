import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, FileText, Image as ImageIcon, Box, Upload, Download, 
  CheckCircle, Clock, MoreHorizontal, X, Eye, File, 
  LayoutDashboard, Users, Settings, LogOut, Search, 
  MessageSquare, ChevronRight, PieChart, Activity, Link as LinkIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, updateProfile, signOut, signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, 
  onSnapshot, query, serverTimestamp, setDoc, getDoc, deleteDoc 
} from 'firebase/firestore';
import * as THREE from 'three';

// --- Firebase Configuration & Init ---
// 自动获取环境配置，如果不可用则使用空配置（会报错提示）
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constants & Utilities ---
const COLLECTIONS = {
  PROJECTS: 'projects',
  USERS: 'users',
  LOGS: 'activity_logs'
};

const ROLES = {
  MANAGER: { label: '产品经理', color: 'bg-indigo-100 text-indigo-700' },
  DESIGNER: { label: '设计师', color: 'bg-pink-100 text-pink-700' },
  ENGINEER: { label: '工程师', color: 'bg-blue-100 text-blue-700' },
  GUEST: { label: '访客', color: 'bg-slate-100 text-slate-700' }
};

const STATUS_MAP = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-800', icon: Activity },
  review: { label: '审核中', color: 'bg-purple-100 text-purple-800', icon: Eye },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800', icon: CheckCircle }
};

// 安全的 Firestore 路径生成器 (遵循规则1)
const getCollectionPath = (collectionName) => {
  return collection(db, 'artifacts', appId, 'public', 'data', collectionName);
};

// --- Components ---

// 1. 3D Viewer (Three.js) - 保持原有逻辑，增加加载状态
const ThreeViewer = ({ isActive, modelUrl }) => {
  const mountRef = useRef(null);
  
  useEffect(() => {
    if (!isActive || !mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Slate-50

    // Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Placeholder Mesh (模拟模型加载)
    const geometry = new THREE.TorusKnotGeometry(1.2, 0.4, 100, 16);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x3b82f6, metalness: 0.6, roughness: 0.2 
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      mesh.rotation.x += 0.005;
      mesh.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
    };
  }, [isActive, modelUrl]);

  return <div ref={mountRef} className="w-full h-full rounded-lg bg-slate-50" />;
};

// 2. Main App Component
export default function RequirementSystemPro() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); // Firestore user profile
  const [projects, setProjects] = useState([]);
  const [usersMap, setUsersMap] = useState({}); // Cache for user names
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 优先检查是否有初始 Token
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
           await signInWithCustomToken(auth, __initial_auth_token);
        } else {
           await signInAnonymously(auth);
        }
      } catch(e) {
        console.error("Auth failed, falling back to anon", e);
        // 如果 custom token 失败，尝试匿名登录作为后备
        try {
           await signInAnonymously(auth);
        } catch (anonErr) {
           console.error("Anonymous auth also failed", anonErr);
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch extended user profile
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.USERS, currentUser.uid);
        // We use onSnapshot for user profile to get real-time role updates
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          } else {
            // Create default profile if not exists
            const defaultProfile = {
              uid: currentUser.uid,
              name: `User-${currentUser.uid.substring(0,4)}`,
              role: 'GUEST',
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.uid}`,
              joinedAt: serverTimestamp()
            };
            setDoc(userRef, defaultProfile);
            setUserData(defaultProfile);
          }
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Fetching (Projects & Users)
  useEffect(() => {
    if (!user) return;

    // Fetch Projects
    const projectsQuery = getCollectionPath(COLLECTIONS.PROJECTS);
    const unsubProjects = onSnapshot(projectsQuery, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Client-side sort by date desc
      projs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setProjects(projs);
    }, (error) => console.error("Error fetching projects:", error));

    // Fetch All Users (for mapping IDs to names)
    const usersQuery = getCollectionPath(COLLECTIONS.USERS);
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const mapping = {};
      snapshot.docs.forEach(doc => {
        mapping[doc.id] = doc.data();
      });
      setUsersMap(mapping);
    }, (error) => console.error("Error fetching users:", error));

    return () => {
      unsubProjects();
      unsubUsers();
    };
  }, [user]);

  // --- Actions ---

  const handleCreateProject = async (data) => {
    if (!user) return;
    try {
      await addDoc(getCollectionPath(COLLECTIONS.PROJECTS), {
        ...data,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'pending',
        inputs: [], // Array of input files
        outputs: [], // Array of output files
        comments: [] // Simple comments array
      });
      setActiveTab('projects');
    } catch (error) {
      console.error("Error creating project:", error);
      alert("创建失败，请重试");
    }
  };

  const handleUpdateStatus = async (projectId, newStatus) => {
    if (!user) return;
    try {
      const projectRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.PROJECTS, projectId);
      await updateDoc(projectRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddFile = async (projectId, fileData, type = 'inputs') => {
    // fileData: { name, url, fileType, format }
    if (!selectedProject || !user) return;
    
    try {
      const projectRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.PROJECTS, projectId);
      const newFile = {
        ...fileData,
        id: crypto.randomUUID(),
        addedBy: user.uid,
        addedAt: new Date().toISOString()
      };
      
      // Update the specific array
      const currentList = selectedProject[type] || [];
      await updateDoc(projectRef, {
        [type]: [...currentList, newFile],
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      alert("添加文件失败");
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!user) return;
    if (confirm('确定要删除这个项目吗？此操作不可恢复。')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.PROJECTS, projectId));
        if (selectedProject?.id === projectId) setSelectedProject(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleUpdateProfile = async (name, role) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', COLLECTIONS.USERS, user.uid);
      await updateDoc(userRef, { name, role });
      alert("个人资料已更新");
    } catch(e) {
      console.error(e);
    }
  };

  // --- Views ---

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-500">正在连接云端服务...</div>;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Box size={20} className="text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">ReqMaster Pro</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setSelectedProject(null); }}
            icon={<LayoutDashboard size={20}/>} 
            label="仪表盘" 
          />
          <NavButton 
            active={activeTab === 'projects' || activeTab === 'detail'} 
            onClick={() => { setActiveTab('projects'); setSelectedProject(null); }}
            icon={<FileText size={20}/>} 
            label="项目管理" 
            badge={projects.length}
          />
          <NavButton 
            active={activeTab === 'team'} 
            onClick={() => { setActiveTab('team'); setSelectedProject(null); }}
            icon={<Users size={20}/>} 
            label="团队成员" 
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
             onClick={() => setActiveTab('settings')}
             className="flex items-center gap-3 p-3 w-full hover:bg-slate-800 rounded-lg transition-colors mb-2"
          >
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden border border-slate-600">
              <img src={userData?.avatar} alt="Me" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium truncate">{userData?.name}</p>
              <p className="text-xs text-slate-400">{ROLES[userData?.role]?.label || '访客'}</p>
            </div>
            <Settings size={16} className="text-slate-400" />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {activeTab === 'dashboard' && '概览仪表盘'}
            {activeTab === 'projects' && '项目列表'}
            {activeTab === 'detail' && '项目详情'}
            {activeTab === 'team' && '团队列表'}
            {activeTab === 'settings' && '个人设置'}
          </h2>
          <div className="flex items-center gap-4">
             {/* Search could go here */}
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          
          {/* DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <DashboardView projects={projects} usersMap={usersMap} user={userData} onNavigate={() => setActiveTab('projects')} />
          )}

          {/* PROJECT LIST VIEW */}
          {activeTab === 'projects' && (
            <ProjectListView 
              projects={projects} 
              onSelect={(p) => { setSelectedProject(p); setActiveTab('detail'); }} 
              onCreate={handleCreateProject}
            />
          )}

          {/* PROJECT DETAIL VIEW */}
          {activeTab === 'detail' && selectedProject && (
             <ProjectDetailView 
               project={selectedProject}
               usersMap={usersMap}
               currentUser={userData}
               onBack={() => { setActiveTab('projects'); setSelectedProject(null); }}
               onUpdateStatus={handleUpdateStatus}
               onAddFile={handleAddFile}
               onDelete={handleDeleteProject}
             />
          )}

           {/* TEAM VIEW */}
           {activeTab === 'team' && (
             <TeamView usersMap={usersMap} />
           )}

           {/* SETTINGS VIEW */}
           {activeTab === 'settings' && (
             <SettingsView userData={userData} onUpdate={handleUpdateProfile} />
           )}

        </div>
      </main>
    </div>
  );
}

// --- Sub Components ---

const NavButton = ({ active, onClick, icon, label, badge }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
      active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span className="font-medium">{label}</span>
    </div>
    {badge > 0 && (
      <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
        {badge}
      </span>
    )}
  </button>
);

const DashboardView = ({ projects, usersMap, user, onNavigate }) => {
  const stats = useMemo(() => {
    return {
      total: projects.length,
      pending: projects.filter(p => p.status === 'pending').length,
      inProgress: projects.filter(p => p.status === 'in_progress' || p.status === 'review').length,
      completed: projects.filter(p => p.status === 'completed').length
    };
  }, [projects]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">欢迎回来, {user?.name}</h1>
          <p className="text-slate-500">这是今天的项目概况</p>
        </div>
        <button onClick={onNavigate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          查看所有项目
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="总项目数" value={stats.total} icon={<Box size={24} className="text-blue-600"/>} bg="bg-blue-50" />
        <StatCard title="待处理" value={stats.pending} icon={<Clock size={24} className="text-yellow-600"/>} bg="bg-yellow-50" />
        <StatCard title="进行中" value={stats.inProgress} icon={<Activity size={24} className="text-purple-600"/>} bg="bg-purple-50" />
        <StatCard title="已交付" value={stats.completed} icon={<CheckCircle size={24} className="text-green-600"/>} bg="bg-green-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <PieChart size={18} className="text-slate-400"/> 项目状态分布
          </h3>
          <div className="h-48 flex items-end justify-around gap-4 px-4 pb-4 border-b border-slate-100">
             {/* CSS only Bar Chart for simplicity */}
             <Bar height={stats.total > 0 ? (stats.pending/stats.total)*100 : 0} color="bg-yellow-400" label="待处理" count={stats.pending} />
             <Bar height={stats.total > 0 ? (stats.inProgress/stats.total)*100 : 0} color="bg-blue-500" label="进行中" count={stats.inProgress} />
             <Bar height={stats.total > 0 ? (stats.completed/stats.total)*100 : 0} color="bg-green-500" label="已完成" count={stats.completed} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-slate-400"/> 最近更新
          </h3>
          <div className="flex-1 overflow-hidden space-y-4">
            {projects.slice(0, 4).map(p => (
              <div key={p.id} className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                <div className={`w-2 h-2 mt-2 rounded-full ${STATUS_MAP[p.status]?.color.split(' ')[0].replace('100', '500')}`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.title}</p>
                  <p className="text-xs text-slate-500">
                    {usersMap[p.createdBy]?.name || '未知用户'} • {new Date(p.updatedAt?.seconds * 1000).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_MAP[p.status]?.color}`}>
                  {STATUS_MAP[p.status]?.label}
                </span>
              </div>
            ))}
            {projects.length === 0 && <p className="text-sm text-slate-400">暂无活动</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Bar = ({ height, color, label, count }) => (
  <div className="flex flex-col items-center gap-2 w-16 group">
    <div className="text-xs font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">{count}</div>
    <div className={`w-full rounded-t-lg transition-all duration-500 ${color}`} style={{ height: `${Math.max(height, 5)}%` }}></div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
);

const StatCard = ({ title, value, icon, bg }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
    <div className={`p-3 rounded-lg ${bg}`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
);

const ProjectListView = ({ projects, onSelect, onCreate }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', description: '' });

  const handleSubmit = () => {
    if (!newProject.title) return alert("标题不能为空");
    onCreate(newProject);
    setShowCreate(false);
    setNewProject({ title: '', description: '' });
  };

  if (showCreate) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-slate-200">
        <h2 className="text-xl font-bold mb-6">新建需求项目</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">项目标题</label>
            <input 
              className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={newProject.title}
              onChange={e => setNewProject({...newProject, title: e.target.value})}
              placeholder="例如：2024 Q1 营销活动页面"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">需求描述</label>
            <textarea 
              className="w-full border border-slate-300 rounded-lg p-2 h-32 focus:ring-2 focus:ring-blue-500 outline-none"
              value={newProject.description}
              onChange={e => setNewProject({...newProject, description: e.target.value})}
              placeholder="请详细描述需求背景、目标和具体要求..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium">创建项目</button>
            <button onClick={() => setShowCreate(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg hover:bg-slate-200 font-medium">取消</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
          <input 
            type="text" 
            placeholder="搜索项目..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium"
        >
          <Plus size={18} /> 新建项目
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
            <tr>
              <th className="px-6 py-4">项目名称</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4">负责人</th>
              <th className="px-6 py-4">更新时间</th>
              <th className="px-6 py-4">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 group transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-500 truncate max-w-xs">{p.description}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_MAP[p.status]?.color}`}>
                     {STATUS_MAP[p.status]?.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {/* In a real app we would query the user name */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p.createdBy}`} alt="" />
                    </div>
                    <span className="text-xs">用户 {p.createdBy.substring(0,4)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {p.updatedAt ? new Date(p.updatedAt.seconds * 1000).toLocaleDateString() : '-'}
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => onSelect(p)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    详情 <ChevronRight size={14}/>
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                  暂无项目，点击右上角新建
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ProjectDetailView = ({ project, usersMap, currentUser, onBack, onUpdateStatus, onAddFile, onDelete }) => {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('inputs'); // 'inputs' or 'outputs'
  
  // State for upload form
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState('doc'); // doc, image, stp
  const [preview3D, setPreview3D] = useState(null); // url of stp to preview

  const statusOptions = Object.keys(STATUS_MAP);

  const handleFileSubmit = () => {
    if(!fileUrl || !fileName) return alert("请填写完整信息");
    onAddFile(project.id, {
      name: fileName,
      url: fileUrl,
      format: fileFormat
    }, uploadType);
    setShowUpload(false);
    setFileUrl('');
    setFileName('');
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Detail Header */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <MoreHorizontal size={20} className="rotate-180"/>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              {project.title}
              <span className={`text-xs px-2 py-1 rounded-full font-normal ${STATUS_MAP[project.status]?.color}`}>
                {STATUS_MAP[project.status]?.label}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              创建人: {usersMap[project.createdBy]?.name || 'Unknown'} • 
              创建于: {project.createdAt ? new Date(project.createdAt.seconds * 1000).toLocaleDateString() : '-'}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          {currentUser?.role === 'MANAGER' && (
             <button onClick={() => onDelete(project.id)} className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
               删除项目
             </button>
          )}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {statusOptions.map(s => (
              <button 
                key={s}
                onClick={() => onUpdateStatus(project.id, s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  project.status === s ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        
        {/* Left: Requirements & Inputs */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FileText className="text-blue-500" size={18}/> 需求描述
            </h3>
            <div className="prose prose-sm prose-slate max-w-none">
              <p className="whitespace-pre-wrap text-slate-600">{project.description}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex-1">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Upload className="text-blue-500" size={18}/> 需求附件 (Inputs)
                </h3>
                <button 
                  onClick={() => { setUploadType('inputs'); setShowUpload(true); }}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-full font-medium transition-colors"
                >
                  + 添加附件
                </button>
             </div>
             
             <div className="space-y-3">
               {project.inputs && project.inputs.length > 0 ? (
                 project.inputs.map((file, idx) => (
                   <FileCard key={idx} file={file} />
                 ))
               ) : (
                 <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-400 text-sm">
                   暂无需求文档
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* Right: Outputs & Preview */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Box className="text-green-600" size={18}/> 交付成果 (Outputs)
              </h3>
              <button 
                onClick={() => { setUploadType('outputs'); setShowUpload(true); }}
                className="text-xs bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full font-medium transition-colors shadow-sm"
              >
                + 提交成果
              </button>
            </div>

            <div className="space-y-3 mb-6">
               {project.outputs && project.outputs.length > 0 ? (
                 project.outputs.map((file, idx) => (
                   <FileCard 
                      key={idx} 
                      file={file} 
                      onPreview3D={file.format === 'stp' ? (url) => setPreview3D(url) : null}
                    />
                 ))
               ) : (
                 <div className="text-center py-8 rounded-lg border border-dashed border-slate-300 text-slate-400 text-sm">
                   暂无交付物，点击上方按钮提交
                 </div>
               )}
            </div>

            {/* 3D Preview Area */}
            {preview3D && (
              <div className="flex-1 bg-slate-900 rounded-lg overflow-hidden relative min-h-[300px] flex flex-col border border-slate-700 shadow-lg">
                <div className="bg-slate-800 px-4 py-2 flex justify-between items-center">
                  <span className="text-xs text-slate-300 font-mono flex items-center gap-2"><Box size={14}/> 3D Preview Mode</span>
                  <button onClick={() => setPreview3D(null)} className="text-slate-400 hover:text-white"><X size={16}/></button>
                </div>
                <div className="flex-1 relative">
                  <ThreeViewer isActive={!!preview3D} modelUrl={preview3D} />
                  {/* Overlay explaining standard demo limits */}
                  <div className="absolute bottom-4 left-4 right-4 bg-black/50 text-white text-xs p-2 rounded backdrop-blur-sm pointer-events-none">
                    注意：由于浏览器安全限制，此处展示通用模型。真实环境将加载: {preview3D.substring(0, 30)}...
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold mb-4">
              {uploadType === 'inputs' ? '上传需求附件' : '提交交付成果'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">文件名称</label>
                <input 
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500"
                  value={fileName}
                  onChange={e => setFileName(e.target.value)}
                  placeholder="例如：产品规格说明书_v1.pdf"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">文件类型</label>
                <div className="flex gap-2">
                   {['doc', 'image', 'stp'].map(t => (
                     <button 
                       key={t}
                       onClick={() => setFileFormat(t)}
                       className={`px-3 py-1 text-xs rounded border capitalize ${
                         fileFormat === t ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600'
                       }`}
                     >
                       {t === 'doc' ? 'Document' : t === 'stp' ? '3D Model' : 'Image'}
                     </button>
                   ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                   文件链接 (URL)
                   <span className="text-xs text-slate-400 ml-2 font-normal">支持 Google Drive, Dropbox, SharePoint</span>
                </label>
                <div className="flex gap-2">
                   <div className="relative flex-1">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                      <input 
                        className="w-full border border-slate-300 rounded-lg pl-9 pr-2 py-2 text-sm outline-none focus:border-blue-500"
                        value={fileUrl}
                        onChange={e => setFileUrl(e.target.value)}
                        placeholder="https://..."
                      />
                   </div>
                </div>
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
                  提示：本环境未连接存储桶，请使用外部链接进行文件托管。
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={handleFileSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">确认添加</button>
                <button onClick={() => setShowUpload(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-200">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FileCard = ({ file, onPreview3D }) => {
  const isImage = file.format === 'image';
  const is3D = file.format === 'stp';

  return (
    <div className="group flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors shadow-sm">
      <div className={`p-2 rounded-lg shrink-0 ${
        is3D ? 'bg-blue-100 text-blue-600' : 
        isImage ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'
      }`}>
        {is3D ? <Box size={20}/> : isImage ? <ImageIcon size={20}/> : <FileText size={20}/>}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400 uppercase bg-slate-100 px-1.5 rounded">{file.format}</span>
          <span className="text-xs text-slate-400">{new Date(file.addedAt || Date.now()).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a 
          href={file.url} 
          target="_blank" 
          rel="noreferrer" 
          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded" 
          title="下载/查看"
        >
          <Download size={16}/>
        </a>
        {is3D && onPreview3D && (
          <button 
            onClick={() => onPreview3D(file.url)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="3D预览"
          >
            <Eye size={16}/>
          </button>
        )}
      </div>
    </div>
  );
};

const SettingsView = ({ userData, onUpdate }) => {
  const [name, setName] = useState(userData?.name || '');
  const [role, setRole] = useState(userData?.role || 'GUEST');

  useEffect(() => {
    if(userData) {
      setName(userData.name);
      setRole(userData.role);
    }
  }, [userData]);

  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold text-slate-800 mb-6">个人设置</h2>
      
      <div className="flex items-center gap-6 mb-8">
        <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden">
          <img src={userData?.avatar} className="w-full h-full object-cover" alt="avatar" />
        </div>
        <div>
          <p className="text-sm text-slate-500 mb-1">用户 ID</p>
          <code className="bg-slate-100 px-2 py-1 rounded text-xs text-slate-600">{userData?.uid}</code>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
          <input 
            className="w-full border border-slate-300 rounded-lg p-2"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">角色权限</label>
          <select 
            className="w-full border border-slate-300 rounded-lg p-2 bg-white"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {Object.entries(ROLES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            * 经理拥有删除项目的权限，其他角色主要负责查看和更新状态。
          </p>
        </div>

        <div className="pt-4">
          <button 
            onClick={() => onUpdate(name, role)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
          >
            保存更改
          </button>
        </div>
      </div>
    </div>
  );
};

const TeamView = ({ usersMap }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Object.values(usersMap).map(u => (
      <div key={u.uid} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden">
          <img src={u.avatar} alt={u.name} />
        </div>
        <div>
          <h3 className="font-medium text-slate-900">{u.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${ROLES[u.role]?.color || 'bg-slate-100'}`}>
            {ROLES[u.role]?.label || u.role}
          </span>
          <p className="text-xs text-slate-400 mt-1">ID: {u.uid.substring(0,6)}...</p>
        </div>
      </div>
    ))}
  </div>
);