import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  FileText, 
  Image as ImageIcon, 
  Box, 
  Upload, 
  Download, 
  CheckCircle, 
  Clock, 
  MoreHorizontal, 
  X,
  Eye,
  File
} from 'lucide-react';

// 注意：Three.js 将通过动态脚本加载，而不是 import
// 移除: import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// --- 模拟数据 ---
const INITIAL_PROJECTS = [
  {
    id: 1,
    title: "新款智能手表外壳设计",
    status: "in_progress",
    date: "2023-10-24",
    description: "需要设计一款运动风格的手表外壳，材质为铝合金，需要包含按键位置。",
    inputs: [
      { type: 'text', content: '参考竞品：Apple Watch Ultra 的倒角设计。' },
      { type: 'image', name: '参考草图.png', url: 'https://placehold.co/600x400/e2e8f0/1e293b?text=Sketch+Reference' },
      { type: 'ppt', name: '产品需求文档_v1.pptx' }
    ],
    outputs: [
      { type: 'text', content: '初步建模已完成，请查看附件。' },
      { type: 'stp', name: 'Watch_Case_v1.stp' } // 3D文件
    ]
  },
  {
    id: 2,
    title: "工业机械臂底座支架",
    status: "pending",
    date: "2023-10-25",
    description: "承重50kg的机械臂底座，需要考虑4个M10螺栓孔位。",
    inputs: [
      { type: 'ppt', name: '技术参数规格书.pdf' }
    ],
    outputs: []
  }
];

// --- 3D Viewer Component (Three.js) ---
const ThreeViewer = ({ isActive }) => {
  const mountRef = useRef(null);
  const [isLibLoaded, setIsLibLoaded] = useState(false);

  // 动态加载 Three.js 脚本
  useEffect(() => {
    if (window.THREE) {
      setIsLibLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.async = true;
    script.onload = () => setIsLibLoaded(true);
    document.body.appendChild(script);

    return () => {
      // 脚本通常保留在页面中以便缓存，此处不做移除
    };
  }, []);

  useEffect(() => {
    // 只有在激活且库加载完成后才初始化
    if (!isActive || !mountRef.current || !isLibLoaded) return;

    const THREE = window.THREE;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Slate-100

    // Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Mesh (Simulating an uploaded .stp part)
    // We create a complex shape to look like a mechanical part
    const geometry = new THREE.TorusKnotGeometry(1.2, 0.4, 100, 16);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x3b82f6, 
      metalness: 0.5, 
      roughness: 0.1,
      wireframe: false
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Animation Loop
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
    };
  }, [isActive, isLibLoaded]);

  if (!isLibLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        加载 3D 引擎中...
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full rounded-lg shadow-inner" />;
};

// --- Main Application Component ---
export default function RequirementApp() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail' or 'create'
  
  // Create Form State
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // 3D Preview State
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [currentStpFile, setCurrentStpFile] = useState('');

  const handleOpenProject = (project) => {
    setSelectedProject(project);
    setViewMode('detail');
    setShow3DPreview(false);
  };

  const handleCreateProject = () => {
    const newProj = {
      id: projects.length + 1,
      title: newProjectTitle || "未命名项目",
      status: "pending",
      date: new Date().toISOString().split('T')[0],
      description: newProjectDesc,
      inputs: [],
      outputs: []
    };
    setProjects([newProj, ...projects]);
    setViewMode('list');
    setNewProjectTitle('');
    setNewProjectDesc('');
  };

  const handleAddOutput = (type) => {
    if (!selectedProject) return;
    
    let newOutput;
    if (type === 'stp') {
      newOutput = { type: 'stp', name: `Design_Review_v${selectedProject.outputs.length + 1}.stp` };
    } else if (type === 'text') {
      newOutput = { type: 'text', content: '新的设计反馈已更新。' };
    } else {
      newOutput = { type: 'image', name: 'render.png', url: 'https://placehold.co/100x100' };
    }

    const updatedProject = {
      ...selectedProject,
      outputs: [...selectedProject.outputs, newOutput]
    };

    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      in_progress: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800"
    };
    const labels = {
      pending: "待处理",
      in_progress: "进行中",
      completed: "已完成"
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  // --- Views ---

  const ListView = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">项目列表</h2>
          <p className="text-slate-500 text-sm">管理您的所有设计需求与交付</p>
        </div>
        <button 
          onClick={() => setViewMode('create')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} /> 新建需求
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <div 
            key={project.id} 
            onClick={() => handleOpenProject(project)}
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-50 transition-colors">
                <Box className="text-slate-600 group-hover:text-blue-600" size={24} />
              </div>
              <StatusBadge status={project.status} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{project.title}</h3>
            <p className="text-slate-500 text-sm mb-4 line-clamp-2">{project.description}</p>
            <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-100 pt-4">
              <span className="flex items-center gap-1"><FileText size={14}/> {project.inputs.length} 输入</span>
              <span className="flex items-center gap-1"><CheckCircle size={14}/> {project.outputs.length} 交付</span>
              <span className="ml-auto flex items-center gap-1"><Clock size={14}/> {project.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const CreateView = () => (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">提交新需求</h2>
        <button onClick={() => setViewMode('list')} className="text-slate-400 hover:text-slate-600">
          <X size={24} />
        </button>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">项目标题</label>
          <input 
            type="text" 
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="例如：新型发动机连杆设计"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">详细描述</label>
          <textarea 
            rows={5}
            value={newProjectDesc}
            onChange={(e) => setNewProjectDesc(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="请描述具体的设计要求、材质偏好、尺寸限制等..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">附件上传 (支持 PPT, 图片)</label>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 cursor-pointer transition-colors">
            <Upload className="mx-auto h-12 w-12 text-slate-400 mb-2" />
            <p className="text-slate-600">点击或拖拽文件到此处</p>
            <p className="text-xs text-slate-400 mt-1">支持 .png, .jpg, .pptx, .pdf</p>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button 
            onClick={handleCreateProject}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
          >
            提交需求
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );

  const DetailView = () => {
    if (!selectedProject) return null;

    return (
      <div className="h-[calc(100vh-100px)] flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
          <button onClick={() => setViewMode('list')} className="p-2 hover:bg-slate-100 rounded-full">
            <div className="rotate-180"><MoreHorizontal size={20}/></div> {/* Simple back simulation */}
            <span className="text-sm font-bold text-slate-500">返回</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{selectedProject.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={selectedProject.status} />
              <span className="text-xs text-slate-500">创建于 {selectedProject.date}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
          
          {/* LEFT COLUMN: Input / Requirements */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-2">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="text-blue-500" size={20}/> 需求详情
              </h3>
              <p className="text-slate-600 whitespace-pre-wrap">{selectedProject.description}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Upload className="text-blue-500" size={20}/> 输入附件 (Input)
              </h3>
              <div className="space-y-3">
                {selectedProject.inputs.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    {item.type === 'image' && <ImageIcon className="text-purple-500" size={24}/>}
                    {item.type === 'ppt' && <File className="text-orange-500" size={24}/>}
                    {item.type === 'text' && <FileText className="text-slate-500" size={24}/>}
                    
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.name || "文本补充"}</p>
                      {item.type === 'text' && <p className="text-xs text-slate-500 truncate">{item.content}</p>}
                    </div>
                    {item.url && (
                       <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-500 text-xs hover:underline">预览</a>
                    )}
                  </div>
                ))}
                {selectedProject.inputs.length === 0 && <p className="text-slate-400 text-sm">无附件输入</p>}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Output / Deliverables */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-2">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Box className="text-green-600" size={20}/> 交付成果 (Output)
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => handleAddOutput('text')} className="p-2 bg-white rounded shadow-sm hover:bg-slate-100 text-slate-600" title="添加文本"><FileText size={16}/></button>
                  <button onClick={() => handleAddOutput('image')} className="p-2 bg-white rounded shadow-sm hover:bg-slate-100 text-slate-600" title="添加图片"><ImageIcon size={16}/></button>
                  <button onClick={() => handleAddOutput('stp')} className="p-2 bg-white rounded shadow-sm hover:bg-slate-100 text-slate-600" title="添加STP模型"><Box size={16}/></button>
                </div>
              </div>

              {/* Output List */}
              <div className="space-y-3 mb-6">
                {selectedProject.outputs.map((item, idx) => (
                  <div key={idx} className="group relative bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-start gap-3">
                      {item.type === 'stp' && <div className="p-2 bg-blue-100 rounded text-blue-600"><Box size={20}/></div>}
                      {item.type === 'image' && <div className="p-2 bg-purple-100 rounded text-purple-600"><ImageIcon size={20}/></div>}
                      {item.type === 'text' && <div className="p-2 bg-slate-100 rounded text-slate-600"><FileText size={20}/></div>}
                      
                      <div className="flex-1">
                         {item.type === 'text' ? (
                           <p className="text-sm text-slate-700">{item.content}</p>
                         ) : (
                           <div>
                             <p className="text-sm font-medium text-slate-800">{item.name}</p>
                             <p className="text-xs text-slate-500 uppercase">{item.type} 文件</p>
                           </div>
                         )}
                      </div>

                      {item.type === 'stp' && (
                        <button 
                          onClick={() => { setShow3DPreview(true); setCurrentStpFile(item.name); }}
                          className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-full hover:bg-blue-700"
                        >
                          <Eye size={12}/> 3D预览
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {selectedProject.outputs.length === 0 && (
                  <div className="text-center py-10 text-slate-400">
                    <p>暂无交付成果</p>
                    <p className="text-xs mt-1">请使用上方按钮添加输出</p>
                  </div>
                )}
              </div>
              
              {/* 3D Preview Panel (Conditional) */}
              {show3DPreview && (
                <div className="flex-1 bg-slate-800 rounded-lg overflow-hidden relative flex flex-col min-h-[300px]">
                  <div className="absolute top-0 left-0 right-0 z-10 bg-slate-900/80 p-3 flex justify-between items-center text-white">
                     <span className="text-xs font-mono flex items-center gap-2"><Box size={14}/> {currentStpFile} (预览模式)</span>
                     <button onClick={() => setShow3DPreview(false)} className="hover:text-red-400"><X size={16}/></button>
                  </div>
                  <div className="flex-1 relative">
                    <ThreeViewer isActive={show3DPreview} />
                    <div className="absolute bottom-4 left-4 text-xs text-slate-400 pointer-events-none">
                      使用鼠标左键旋转 (模拟)
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Box size={24} />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              ReqManage 需求工场
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex text-sm text-slate-500 gap-6">
              <span className="hover:text-blue-600 cursor-pointer">仪表盘</span>
              <span className="hover:text-blue-600 cursor-pointer">项目归档</span>
              <span className="hover:text-blue-600 cursor-pointer">团队管理</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
               <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {viewMode === 'list' && <ListView />}
        {viewMode === 'create' && <CreateView />}
        {viewMode === 'detail' && <DetailView />}
      </main>
    </div>
  );
}