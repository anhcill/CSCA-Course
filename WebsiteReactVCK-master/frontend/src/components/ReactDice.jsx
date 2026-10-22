import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const ReactDice = ({ isDarkMode }) => {
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [position, setPosition] = useState(0);
  const [tip, setTip] = useState('');
  const animationRef = useRef(null);
  const { t, i18n } = useTranslation();
  // Keep only one topics declaration
  const initialTopics = [ // Rename to avoid re-declaration issue
    {
      name: 'Hooks',
      color: '#61dafb',
      tips: [
        "useEffect() có thể trả về một hàm cleanup để xóa các event listeners hoặc subscriptions.",
        "React.memo() giúp tránh việc render lại component khi props không thay đổi.",
        "useMemo() và useCallback() giúp tối ưu hóa hiệu suất bằng cách lưu kết quả tính toán.",
        "useRef() không chỉ dùng để truy cập DOM mà còn để lưu các giá trị không gây render lại.",
        "useState() có thể nhận vào một callback function để khởi tạo state phức tạp."
      ]
    },
    {
      name: 'Components',
      color: '#ff6b6b',
      tips: [
        "Pure Components tự động thực hiện shallow comparison trên props và state.",
        "Higher-Order Components (HOC) là pattern để tái sử dụng logic giữa các components.",
        "Error Boundaries giúp bắt lỗi và hiển thị fallback UI thay vì làm crash ứng dụng.",
        "React.lazy() và Suspense giúp load components theo demand để giảm kích thước bundle.",
        "Render props là kỹ thuật chia sẻ code giữa các React components bằng một prop là function."
      ]
    },
    {
      name: 'JSX',
      color: '#f0db4f',
      tips: [
        "JSX cho phép bạn viết biểu thức JavaScript trong dấu ngoặc nhọn {}.",
        "React Fragment (<></>) giúp trả về nhiều phần tử mà không cần thêm DOM node.",
        "Các thuộc tính HTML trong JSX được viết theo camelCase (ví dụ: onClick thay vì onclick).",
        "className được sử dụng thay vì class trong JSX để định style CSS.",
        "Bạn có thể sử dụng toán tử && để render có điều kiện trong JSX."
      ]
    },
    {
      name: 'Redux',
      color: '#764abc',
      tips: [
        "Redux Toolkit giúp giảm boilerplate code khi làm việc với Redux.",
        "Selectors giúp truy xuất và tính toán dữ liệu từ Redux store hiệu quả.",
        "Redux Middleware như redux-thunk hoặc redux-saga xử lý side effects trong Redux.",
        "Redux DevTools cho phép debug state và action flows trong ứng dụng.",
        "createSlice() trong Redux Toolkit tự động tạo actions và reducers."
      ]
    },
    {
      name: 'Router',
      color: '#ca4245',
      tips: [
        "useParams() hook trong React Router giúp truy cập các route parameters.",
        "React Router v6 sử dụng element prop thay vì component và render props.",
        "Outlet component cho phép render các nested routes trong React Router.",
        "useNavigate() hook thay thế history.push() để điều hướng lập trình.",
        "React Router hỗ trợ cả client-side routing và server-side routing."
      ]
    },
    {
      name: 'Context',
      color: '#20C997',
      tips: [
        "Context API giúp truyền dữ liệu qua component tree mà không cần prop drilling.",
        "useContext() hook giúp sử dụng Context API dễ dàng hơn trong functional components.",
        "createContext() có thể nhận giá trị mặc định cho context.",
        "Context.Provider bao bọc components cần truy cập context value.",
        "Multiple contexts có thể được sử dụng cùng lúc trong một component."
      ]
    }
  ];
  // Then define translatedTips after topics
  const translatedTips = {
    Hooks: {
      en: [
        "useEffect() can return a cleanup function to remove event listeners or subscriptions.",
        "React.memo() helps prevent unnecessary re-renders when props don't change.",
        "useMemo() and useCallback() optimize performance by memoizing computed values.",
        "useRef() isn't just for DOM access, it can store values without causing re-renders.",
        "useState() can accept a callback function for complex state initialization."
      ],
      vi: initialTopics[0].tips // Use initialTopics here as well
    },
    Components: {
      en: [
        "Pure Components automatically perform shallow comparison on props and state.",
        "Higher-Order Components (HOC) is a pattern for reusing component logic.",
        "Error Boundaries catch errors and display fallback UI instead of crashing.",
        "React.lazy() and Suspense help load components on demand to reduce bundle size.",
        "Render props is a technique for sharing code between React components."
      ],
      vi: initialTopics[1].tips // Use initialTopics here as well
    },
    JSX: {
      en: [
        "JSX allows you to write JavaScript expressions within curly braces {}.",
        "React Fragment (<></>) helps return multiple elements without adding DOM nodes.",
        "HTML attributes in JSX are written in camelCase (e.g., onClick instead of onclick).",
        "className is used instead of class in JSX for CSS styling.",
        "You can use && operator for conditional rendering in JSX."
      ],
      vi: initialTopics[2].tips // Use initialTopics here as well
    },
    Redux: {
      en: [
        "Redux Toolkit helps reduce boilerplate code when working with Redux.",
        "Selectors help efficiently access and compute data from Redux store.",
        "Redux Middleware like redux-thunk or redux-saga handles side effects.",
        "Redux DevTools allows debugging state and action flows in the application.",
        "createSlice() in Redux Toolkit automatically generates actions and reducers."
      ],
      vi: initialTopics[3].tips // Use initialTopics here as well
    },
    Router: {
      en: [
        "useParams() hook in React Router helps access route parameters.",
        "React Router v6 uses element prop instead of component and render props.",
        "Outlet component allows rendering nested routes in React Router.",
        "useNavigate() hook replaces history.push() for programmatic navigation.",
        "React Router supports both client-side and server-side routing."
      ],
      vi: initialTopics[4].tips // Use initialTopics here as well
    },
    Context: {
      en: [
        "Context API helps pass data through component tree without prop drilling.",
        "useContext() hook makes using Context API easier in functional components.",
        "createContext() can receive default value for context.",
        "Context.Provider wraps components that need access to context value.",
        "Multiple contexts can be used simultaneously in a component."
      ],
      vi: initialTopics[5].tips // Use initialTopics here as well
    }
  };
  // Update the tip selection function
  const getRandomTip = (topicIndex) => {
    const topic = initialTopics[topicIndex]; // Use initialTopics here
    const currentLang = i18n.language;
    const tips = translatedTips[topic.name][currentLang] || translatedTips[topic.name]['en'];
    return tips[Math.floor(Math.random() * tips.length)];
  };
  const rollDice = () => {
    if (rolling) return;

    setRolling(true);
    setResult(null); // Reset result when rolling starts
    setPosition(0); // Reset position as well

    // Random end rotations
    const possibleRotations = [
      { x: 0, y: 0, z: 0 },       // Front
      { x: 0, y: 180, z: 0 },     // Back
      { x: -90, y: 0, z: 0 },     // Top
      { x: 90, y: 0, z: 0 },      // Bottom
      { x: 0, y: -90, z: 0 },     // Right
      { x: 0, y: 90, z: 0 }       // Left
    ];

    // Choose random result
    const resultIndex = Math.floor(Math.random() * 6);

    // Add extra spins
    const extraSpins = {
      x: Math.floor(Math.random() * 3 + 2) * 360,
      y: Math.floor(Math.random() * 3 + 2) * 360,
      z: Math.floor(Math.random() * 3 + 2) * 360
    };

    const finalRotation = {
      x: possibleRotations[resultIndex].x + extraSpins.x,
      y: possibleRotations[resultIndex].y + extraSpins.y,
      z: possibleRotations[resultIndex].z
    };

    // Animation parameters
    const duration = 3000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing functions
      const easeOutBounce = (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;

        if (t < 1 / d1) {
          return n1 * t * t;
        } else if (t < 2 / d1) {
          return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
          return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
          return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
      };

      // Combine easing functions for better effect
      let positionProgress;

      // First go up, then come down with bounce
      if (progress < 0.5) {
        // Going up (first half of animation)
        positionProgress = -300 * (progress * 2);
      } else {
        // Coming down with bounce (second half)
        positionProgress = -300 + (easeOutBounce((progress - 0.5) * 2) * 300);
      }

      // Update position (vertical movement)
      setPosition(positionProgress);

      // Thêm hiệu ứng quay mượt hơn
      const rotationProgress = progress < 0.8 ? progress / 0.8 : 1;
      const easeRotation = t => 1 - Math.pow(1 - t, 4); // Thêm easing function

      setRotation({
        x: easeRotation(rotationProgress) * finalRotation.x,
        y: easeRotation(rotationProgress) * finalRotation.y,
        z: easeRotation(rotationProgress) * finalRotation.z
      });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setRolling(false);
        setResult(resultIndex);
        setTip(getRandomTip(resultIndex));
      }
    };
    animate(); // Start animation immediately when rollDice is called
  };
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  const size = 200;
  const boderSize = size / 2;
  const sizeString = size + 'px';
  const boderSizeString = boderSize + 'px';
  return (
    <div className={`flex flex-col items-center justify-center h-full p-4 bg-gray-100 dark:bg-gray-800 rounded-lg transition-colors duration-200`}>
      <div
        className="relative w-64 h-64 flex items-center justify-center cursor-pointer mb-4"
        onClick={rollDice}
      >
        <div
          className={`relative transition-transform ${rolling ? '' : 'hover:shadow-lg hover:scale-110'}`}
          style={{
            transform: `translateY(${position}px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
            transformStyle: 'preserve-3d',
            width: sizeString,
            height: sizeString,
          }}
        >
          {/* Front Face */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow-2xl"
            style={{
              backgroundColor: initialTopics[0].color, // Use initialTopics here
              transform: 'translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-3xl font-extrabold tracking-wider">
              {initialTopics[0].name} {/* Use initialTopics here */}
            </div>
          </div>
          {/* Back Face - Apply similar styles to all faces */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow-2xl"
            style={{
              backgroundColor: initialTopics[1].color, // Use initialTopics here
              transform: 'rotateY(180deg) translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-2xl font-extrabold tracking-wider">
              {initialTopics[1].name} {/* Use initialTopics here */}
            </div>
          </div>
          {/* Top Face */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow"
            style={{
              backgroundColor: initialTopics[2].color, // Use initialTopics here
              transform: 'rotateX(90deg) translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-3xl font-extrabold tracking-wider">
              {initialTopics[2].name} {/* Use initialTopics here */}
            </div>
          </div>

          {/* Bottom Face */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow"
            style={{
              backgroundColor: initialTopics[3].color, // Use initialTopics here
              transform: 'rotateX(-90deg) translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-3xl font-extrabold tracking-wider">
              {initialTopics[3].name} {/* Use initialTopics here */}
            </div>
          </div>

          {/* Right Face */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow"
            style={{
              backgroundColor: initialTopics[4].color, // Use initialTopics here
              transform: 'rotateY(90deg) translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-3xl font-extrabold tracking-wider">
              {initialTopics[4].name} {/* Use initialTopics here */}
            </div>
          </div>

          {/* Left Face */}
          <div
            className="absolute w-full h-full flex items-center justify-center font-bold text-white rounded shadow"
            style={{
              backgroundColor: initialTopics[5].color, // Use initialTopics here
              transform: 'rotateY(-90deg) translateZ(' + boderSizeString + ')',
              backfaceVisibility: 'hidden',
              border: '3px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 0 20px rgba(0,0,0,0.2)',
              textShadow: `
                3px 3px 0 rgba(0,0,0,0.2),
                -2px -2px 0 rgba(255,255,255,0.3),
                0 4px 6px rgba(0,0,0,0.4),
                0 0 15px rgba(255,255,255,0.5)
              `
            }}
          >
            <div className="transform hover:scale-110 transition-transform duration-300 text-3xl font-extrabold tracking-wider">
              {initialTopics[5].name} {/* Use initialTopics here */}
            </div>
          </div>
        </div>
      </div>

      <button
        className={`px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600
          focus:outline-none disabled:opacity-50 transition-colors duration-200
          ${isDarkMode ? 'hover:bg-blue-700' : 'hover:bg-blue-600'}`}
        onClick={rollDice}
        disabled={rolling}
      >
        {rolling ? t('dice.rolling') : t('dice.roll')}
      </button>

      {result !== null && !rolling && (
        <div className="mt-4 rounded-3xl shadow-xl overflow-hidden w-full max-w-md relative">



          {/* Original gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 rounded-3xl blur-lg opacity-70 animate-pulse"></div>




          {/* Gradient border */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 rounded-3xl"></div>



          <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl p-6 border border-white/20 shadow-2xl">
            {/* Enhanced Header card with gradient text */}
            <div className="flex items-center justify-start mb-5">
              <div
                className="w-12 h-12 rounded-xl mr-4 flex items-center justify-center font-bold text-white shadow-lg transform hover:scale-105 transition-transform"
                style={{
                  backgroundColor: initialTopics[result].color, // Use initialTopics here
                  boxShadow: `0 0 20px ${initialTopics[result].color}40` // Use initialTopics here
                }}
              >
                <span className="text-2xl">✨</span>
              </div>
              <h3
                className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-purple-400 dark:to-pink-400"
              >
                {initialTopics[result].name} {/* Use initialTopics here */}
              </h3>
            </div>

            {/* Enhanced Tip section */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-gray-50/90 to-white/50 dark:from-gray-700/90 dark:to-gray-800/50 shadow-inner border border-white/10 dark:border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">💡</span>
                <p className="text-gray-700 dark:text-gray-300 font-semibold">{t('dice.interesting_tip')}:</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-1 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                <p className="text-gray-600 dark:text-gray-200 leading-relaxed">{tip}</p>
              </div>
            </div>

            {/* Add decorative elements */}
            <div className="absolute top-2 right-2 text-2xl animate-spin-slow">✨</div>
            <div className="absolute bottom-2 left-2 text-2xl animate-bounce-slow">🌟</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReactDice;
