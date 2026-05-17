// Generated from the Cisco-style OS quiz markdown files.
// Source files live in C:/Users/admin/Downloads/OS_Quiz_Module1_v3.md and OS_Quiz_Module2_v3.md.
window.OS_ODYSSEY_CISCO_MODULES = {
  "module1": {
    "number": "Module 1",
    "title": "Introduction to Operating Systems",
    "summary": "Nice work finishing Module 1. You practiced OS foundations, hardware structure, interrupts, storage, processes, and protection.",
    "review": [
      {
        "title": "1.1 What is an Operating System?",
        "body": "<p>An <strong>Operating System (OS)</strong> is a program that acts as the intermediary between the user and computer hardware. Its primary goals are to make the computer <strong>easy to use</strong>, to execute user programs and solve user problems efficiently, and to manage hardware resources in a fair and orderly manner. Without the OS, every application developer would need to write code that directly manages hardware — a task that is both complex and error-prone.</p>\n<p>At its most essential level, the OS is described as <strong>\"the one program running at all times\"</strong> — this core component is called the <strong>kernel</strong>. Everything else is either a <strong>system program</strong> (shipped with the OS, such as shells and utilities) or an <strong>application program</strong> (installed by the user). Some systems also include <strong>middleware</strong> — software frameworks that sit above the kernel but below application programs, providing additional services such as databases, multimedia support, and graphics engines.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.1 What is an Operating System?",
        "body": "<p>The OS serves two major roles simultaneously. As a <strong>resource allocator</strong>, it manages and arbitrates among all hardware resources — CPU time, memory space, I/O devices — deciding who gets what and when. As a <strong>control program</strong>, it supervises the execution of user programs to prevent errors and improper use of the computer.</p>\n<p>These roles can sometimes be in tension: being a good resource allocator means being efficient, while being a good control program means being protective. The OS must balance both. For example, allowing a process to hold the CPU indefinitely would be efficient for that process but unfair and dangerous for all others — so the OS uses mechanisms like <strong>timers</strong> and <strong>scheduling</strong> to enforce balance.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.1 What is an Operating System?",
        "body": "<p>One key challenge in OS design is that there is <strong>no universally agreed-upon definition</strong> of what belongs inside the OS. The narrow view says only the kernel is the OS. A broader view includes all software distributed with the OS. In practice, OS boundaries are defined by what vendors ship with their systems.</p>\n<p>Modern operating systems must handle <strong>diverse hardware environments</strong> — from embedded systems with minimal resources to large data centers managing thousands of processors. This means an OS must be flexible, scalable, and portable. Features like <strong>loadable modules</strong>, <strong>hardware abstraction layers</strong>, and <strong>virtual machine monitors</strong> all help operating systems adapt to these varying environments.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.2 Computer System Structure",
        "body": "<p>A computer system has four essential components. <strong>Hardware</strong> provides the basic computing resources — the CPU, memory, and I/O devices. The <strong>Operating System</strong> coordinates and controls how hardware is used by application programs and users. <strong>Application Programs</strong> define the ways these resources are used to solve user problems (browsers, compilers, games, databases). <strong>Users</strong> — whether people, other machines, or other computers — interact with these resources via the OS and applications.</p>\n<p>The OS sits in the middle of this hierarchy, acting as the bridge between raw hardware and the application layer. Without it, each application would need to manage hardware directly — an impossibly complex and unsafe task. The OS provides a clean, consistent interface to hardware regardless of the underlying physical devices.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.2 Computer System Structure",
        "body": "<p>At the hardware level, one or more CPUs and device controllers are connected through a <strong>common bus</strong> that provides access to shared memory. Each <strong>device controller</strong> is responsible for a specific type of device (disk controller, USB controller, graphics adapter) and maintains a <strong>local buffer</strong> and a set of special-purpose registers. The CPU moves data between main memory and these local buffers to operate devices.</p>\n<p>A <strong>device driver</strong> is the OS-level software that understands a particular device controller. It provides a <strong>uniform interface</strong> to the rest of the OS, hiding the low-level details of the hardware. This abstraction is critical — the OS can treat all disk drives the same way even if they use different hardware, as long as each has a proper driver.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.2 Computer System Structure",
        "body": "<p>When a device controller finishes an operation, it must notify the CPU. It does this via an <strong>interrupt</strong>, which causes the CPU to stop what it is doing, save its state, and transfer control to a specific <strong>interrupt service routine (ISR)</strong> that handles the device's completion event.</p>\n<p><strong>Concurrent operation</strong> of the CPU and device controllers is a key feature of modern systems. While the CPU executes user processes, multiple device controllers can simultaneously transfer data between their local buffers and main memory using <strong>Direct Memory Access (DMA)</strong>. With DMA, the device controller transfers an entire block of data directly to/from memory without CPU intervention — the CPU is interrupted only once per block rather than once per byte, greatly improving efficiency.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.3 Interrupts & Computer Startup",
        "body": "<p>When a computer is powered on, it must go through an initialization sequence before the OS can run. A <strong>bootstrap program</strong> stored in <strong>ROM or EPROM</strong> (sometimes called firmware) runs first. It initializes all aspects of the system: CPU registers, device controllers, and memory contents. After initialization, it locates the OS <strong>kernel</strong>, loads it into main memory, and begins its execution. From that point forward, the OS takes control of the computer.</p>\n<p>The bootstrap program is simple but critical — without it, the computer would have no way to find or load the OS. In modern systems, this firmware is often called <strong>BIOS</strong> (Basic Input/Output System) or <strong>UEFI</strong> (Unified Extensible Firmware Interface), which also performs hardware self-tests before loading the bootloader.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.3 Interrupts & Computer Startup",
        "body": "<p>Once running, the OS is entirely <strong>interrupt-driven</strong>. An <strong>interrupt</strong> is a signal sent to the CPU indicating that some event requires immediate attention. Hardware devices send interrupts by asserting a signal on the CPU's <strong>interrupt request line</strong>. When the CPU detects an interrupt, it saves its current state (registers, program counter), looks up the appropriate handler in the <strong>interrupt vector table</strong>, and executes the corresponding <strong>interrupt service routine (ISR)</strong>.</p>\n<p>After the ISR finishes, the CPU <strong>restores its saved state</strong> and resumes the interrupted computation. This entire sequence happens thousands of times per second in a running system, enabling devices like keyboards, network cards, and storage controllers to communicate asynchronously with the CPU.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.3 Interrupts & Computer Startup",
        "body": "<p>Interrupts can also be generated by software. A <strong>trap</strong> (also called an <strong>exception</strong>) is a software-generated interrupt caused by an error condition — such as division by zero, illegal memory access, or an invalid instruction. Traps cause the OS to handle the error, usually by terminating the offending process or signaling it.</p>\n<p>A <strong>system call</strong> is a deliberate software interrupt that a user program issues to request an OS service — for example, reading a file or allocating memory. System calls use a special instruction (e.g., <code>syscall</code> or <code>int 0x80</code>) that transfers control from user mode to kernel mode in a controlled, safe way. The OS identifies which service is needed via a <strong>system call number</strong> and executes the appropriate kernel routine.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.4 Storage Hierarchy & Caching",
        "body": "<p>Computer storage is organized in a <strong>hierarchy</strong> based on speed, cost per bit, and capacity. At the top are <strong>registers</strong> — tiny storage locations inside the CPU, extremely fast, but very few and expensive. Below are <strong>cache memory</strong> levels (L1, L2, L3) — still fast but larger. Then comes <strong>main memory (RAM)</strong>, which is much larger but slower and <strong>volatile</strong> (data is lost when power is cut).</p>\n<p>Further down the hierarchy are <strong>secondary storage</strong> devices — <strong>hard disk drives (HDD)</strong> and <strong>solid-state drives (SSD)</strong> — which are <strong>nonvolatile</strong> (data persists without power), far larger than RAM, but significantly slower. Finally, <strong>tertiary storage</strong> such as optical discs and magnetic tapes provides massive but very slow archival capacity. The fundamental tradeoff is: the faster the storage, the more expensive and the smaller its capacity.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.4 Storage Hierarchy & Caching",
        "body": "<p>The CPU can <strong>only directly access main memory</strong> (and its internal registers). To execute a program, its instructions and data must first be loaded into main memory from secondary storage. If a needed item is not in main memory, a <strong>page fault</strong> or similar mechanism triggers a transfer. This is why main memory is often called <strong>primary storage</strong> — it is the staging area for everything the CPU processes.</p>\n<p><strong>Secondary storage</strong> extends main memory into a nonvolatile space. Hard disks store data on rotating magnetic platters; SSDs use flash memory chips with no moving parts, giving them faster access times. The OS manages secondary storage using <strong>file systems</strong> and <strong>disk scheduling algorithms</strong> to organize and efficiently retrieve data.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.4 Storage Hierarchy & Caching",
        "body": "<p><strong>Caching</strong> is the technique of temporarily copying frequently accessed data from a <strong>slower storage level</strong> into a <strong>faster storage level</strong> to improve performance. For example, frequently used disk data is cached in RAM; frequently used RAM data is cached in CPU cache. The CPU first looks in its fastest cache; if the data is there (<strong>cache hit</strong>), it uses it immediately; if not (<strong>cache miss</strong>), it fetches it from the next slower level.</p>\n<p>Cache management involves two critical decisions: <strong>cache size</strong> (larger cache = more hits but more cost) and <strong>replacement policy</strong> (when the cache is full, which item to evict — e.g., LRU: Least Recently Used). In <strong>multiprocessor systems</strong>, <strong>cache coherency</strong> is an important challenge: when multiple CPUs each have a local cache, they must all reflect the same value for shared data. The hardware and OS must coordinate updates across caches to prevent inconsistencies.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.5 Processes, Multiprogramming & Protection",
        "body": "<p>A <strong>process</strong> is a program in execution — it is an active, living entity that requires resources to perform its work: CPU time, memory space, I/O device access, files, and initialization data. A <strong>program</strong> is a passive entity (a file on disk); a <strong>process</strong> is what that program becomes when it is loaded into memory and begins executing.</p>\n<p>The OS is responsible for managing all processes. It must: create and delete user and system processes, schedule processes on the CPU, suspend and resume processes, provide mechanisms for process synchronization and communication, and handle <strong>deadlocks</strong> — situations where two or more processes wait forever for resources held by each other.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.5 Processes, Multiprogramming & Protection",
        "body": "<p><strong>Multiprogramming</strong> is the ability to keep multiple jobs in memory simultaneously, so that when one job is waiting (for I/O, for example), the CPU immediately switches to another. This ensures the CPU is almost always busy, dramatically improving system throughput. Without multiprogramming, the CPU would sit idle every time a job waited for slow I/O.</p>\n<p><strong>Timesharing</strong> (multitasking) extends multiprogramming to interactive users. The CPU switches between jobs so quickly — typically in sub-second intervals — that each user perceives their own dedicated machine. A <strong>job scheduler</strong> (long-term) decides which jobs load into memory; a <strong>CPU scheduler</strong> (short-term) decides which process runs next on the CPU. <strong>Virtual memory</strong> allows processes to run even if they are not entirely in memory, enabling systems to run more processes than physically fit in RAM.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "1.5 Processes, Multiprogramming & Protection",
        "body": "<p>To protect itself and user processes from each other, the OS uses <strong>dual-mode operation</strong>. A hardware <strong>mode bit</strong> tracks the current mode: <strong>user mode</strong> (mode bit = 1, restricted — for application programs) or <strong>kernel mode</strong> (mode bit = 0, privileged — for OS code). <strong>Privileged instructions</strong> — such as I/O instructions and memory management operations — can only execute in kernel mode.</p>\n<p>When a user program needs an OS service, it issues a <strong>system call</strong>, which triggers a <strong>trap</strong> instruction. The hardware automatically switches the mode bit to kernel mode, saves the user's state, and jumps to the OS's system call handler. After the OS completes the service, it restores user state and switches back to user mode. A <strong>hardware timer</strong> prevents any single process from monopolizing the CPU — when the timer fires, it generates an interrupt that forces the OS to regain control and decide which process runs next.</p>\n<p>─────────────────────────────────</p>"
      }
    ],
    "quizType": "multiple-choice",
    "quiz": [
      {
        "type": "multiple-choice",
        "question": "What is the primary role of the <strong>kernel</strong> in an operating system?",
        "options": [
          "To provide the graphical user interface and manage application windows",
          "To act as the one program running at all times, managing hardware resources",
          "To permanently store data in secondary storage",
          "To execute application programs directly without hardware involvement"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "The kernel is the core of the OS — it runs continuously, manages hardware resources, and handles system calls from user programs."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following best describes the OS acting as a <strong>resource allocator</strong>?",
        "options": [
          "Preventing errors by supervising program execution",
          "Managing and arbitrating use of CPU, memory, and I/O devices among processes",
          "Providing a graphical interface for the user",
          "Storing application programs on the hard disk"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "As a resource allocator, the OS decides who gets what hardware resource and when — fairly distributing CPU time, memory, and I/O access."
      },
      {
        "type": "multiple-choice",
        "question": "What distinguishes a <strong>process</strong> from a <strong>program</strong>?",
        "options": [
          "A program is running in memory; a process is stored on disk",
          "A process is a program in active execution requiring CPU, memory, and I/O resources",
          "A program requires resources; a process does not",
          "They are identical — the terms are interchangeable"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "A program is a passive file on disk. A process is that program actively loaded into memory and executing, with resources allocated to it by the OS."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following best describes <strong>dual-mode operation</strong>?",
        "options": [
          "Running two operating systems simultaneously on the same machine",
          "Using two CPUs to execute instructions in parallel",
          "Switching between user mode and kernel mode to protect system resources",
          "Dividing memory into two equal halves for user programs and the OS"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "Dual-mode uses a hardware mode bit to separate restricted user mode from privileged kernel mode, preventing user programs from directly damaging the OS or hardware."
      },
      {
        "type": "multiple-choice",
        "question": "What is the purpose of <strong>caching</strong> in a computer system's storage hierarchy?",
        "options": [
          "To permanently store data when the computer is turned off",
          "To temporarily copy frequently used data into faster storage to improve performance",
          "To protect sensitive data from unauthorized access",
          "To increase the total capacity of secondary storage"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Caching places data in a faster storage layer so the system can access it quickly, without repeatedly reading from slower storage such as a hard disk."
      },
      {
        "type": "multiple-choice",
        "question": "What is stored in the <strong>interrupt vector table</strong>?",
        "options": [
          "The list of currently running processes",
          "Pointers (addresses) to the interrupt service routines for each interrupt type",
          "The contents of main memory at the time of the interrupt",
          "The operating system's kernel code"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "The interrupt vector table maps each interrupt type to its service routine. When an interrupt fires, the CPU uses this table to jump directly to the correct handler."
      },
      {
        "type": "multiple-choice",
        "question": "Which storage type is the <strong>only one the CPU can directly access</strong> for executing instructions?",
        "options": [
          "Secondary storage (HDD/SSD)",
          "Tertiary storage (magnetic tape)",
          "Main memory (RAM)",
          "Optical disc storage"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "The CPU can only directly access main memory (and registers). Programs and data must be loaded into RAM before the CPU can process them."
      },
      {
        "type": "multiple-choice",
        "question": "What is the role of a <strong>bootstrap program</strong>?",
        "options": [
          "It manages memory allocation during normal OS operation",
          "It is stored in ROM/EPROM, initializes the system, and loads the OS kernel into memory",
          "It handles hardware interrupt requests from device controllers",
          "It provides the graphical user interface at system startup"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "The bootstrap program is the very first code that runs when a computer powers on. It initializes hardware and finds and loads the OS kernel so the system can begin normal operation."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>Multiprogramming</strong> primarily improves which aspect of system performance?",
        "options": [
          "Security, by isolating user programs from the OS",
          "CPU utilization, by keeping the CPU busy when one job is waiting for I/O",
          "Storage capacity, by compressing data before saving it",
          "Network throughput, by multiplexing connections across users"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Multiprogramming keeps multiple jobs in memory so the CPU can immediately switch to another job whenever the current job is blocked waiting for I/O, minimizing idle time."
      },
      {
        "type": "multiple-choice",
        "question": "A <strong>hardware timer</strong> in an OS context is used to:",
        "options": [
          "Synchronize clocks between different computers on a network",
          "Measure how long each instruction takes to execute",
          "Prevent any single process from monopolizing the CPU indefinitely",
          "Regulate the speed of the memory bus"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "The hardware timer fires periodically, generating an interrupt that forces control back to the OS. This allows the OS to preempt a running process and schedule another one."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following correctly describes <strong>timesharing (multitasking)</strong>?",
        "options": [
          "Running multiple CPUs on the same task to finish it faster",
          "Allowing only one user to run programs at a time for security",
          "Switching the CPU between jobs so rapidly that each user perceives a dedicated machine",
          "Saving CPU state to disk when memory runs out"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "Timesharing extends multiprogramming to interactive use — the CPU switches between jobs in sub-second intervals, creating the illusion for each user of having the computer to themselves."
      },
      {
        "type": "multiple-choice",
        "question": "What is a <strong>trap</strong> in the context of OS interrupts?",
        "options": [
          "A hardware signal from a device controller to the CPU",
          "A software-generated interrupt caused by an error or a deliberate system call",
          "A technique for caching frequently accessed data",
          "A mechanism for loading the bootstrap program into memory"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "A trap is a software-generated interrupt. It can be triggered by errors (e.g., division by zero) or deliberately by a user program making a system call to request OS services."
      },
      {
        "type": "multiple-choice",
        "question": "In the <strong>storage hierarchy</strong>, which correctly orders storage types from <strong>fastest to slowest</strong>?",
        "options": [
          "Hard disk → RAM → Cache → Registers",
          "Registers → Cache → RAM → Hard disk",
          "RAM → Registers → Cache → Hard disk",
          "Cache → Registers → RAM → SSD"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "The hierarchy from fastest/smallest to slowest/largest is: Registers → Cache → RAM → Hard disk (and slower). Each level trades speed for capacity."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>Direct Memory Access (DMA)</strong> is a technique that:",
        "options": [
          "Allows the OS to copy data directly between two different processes",
          "Enables a device controller to transfer data to/from memory without continuous CPU intervention",
          "Gives user programs direct access to hardware registers",
          "Allows the CPU to run in user mode when accessing I/O devices"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "With DMA, a device controller handles its own data transfer to/from main memory. The CPU is interrupted only once when the entire block transfer completes, freeing the CPU for other work."
      },
      {
        "type": "multiple-choice",
        "question": "What is <strong>cache coherency</strong>, and why does it matter?",
        "options": [
          "It refers to keeping backup copies of cache data on secondary storage",
          "It ensures that multiple CPUs with separate caches all see consistent values for shared data",
          "It refers to the replacement policy that evicts the least recently used cache entry",
          "It describes the process of loading the OS kernel into cache at startup"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "In multiprocessor systems, each CPU may have a local cache. Cache coherency protocols ensure that when one CPU modifies shared data, all other CPUs see the updated value, preventing data inconsistency."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following is a <strong>privileged instruction</strong> that can only execute in kernel mode?",
        "options": [
          "Adding two integers",
          "Reading data from a variable in user memory",
          "Issuing an I/O operation to a device controller",
          "Calling a user-defined function"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "I/O instructions are privileged — if user programs could issue I/O directly, they could interfere with other processes or the OS. The OS mediates all I/O through system calls in kernel mode."
      },
      {
        "type": "multiple-choice",
        "question": "What role do <strong>device drivers</strong> play in the OS?",
        "options": [
          "They replace device controllers at the hardware level",
          "They provide a uniform interface to the OS for each type of device, hiding hardware details",
          "They allow user programs to access hardware registers directly",
          "They store data in secondary storage on behalf of the OS"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Device drivers are OS-level software that understand specific hardware. They abstract away hardware differences so the rest of the OS can interact with all devices through a consistent interface."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following best explains why <strong>main memory is volatile</strong>?",
        "options": [
          "It becomes slower over time as more data is written to it",
          "Its data is lost when electrical power is removed",
          "It can only hold a limited number of write cycles before failing",
          "It requires constant cooling to prevent data corruption"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Volatile storage requires power to maintain its data. RAM loses all its contents the moment power is cut. This is why programs and data are persistently stored on nonvolatile secondary storage."
      },
      {
        "type": "multiple-choice",
        "question": "The OS's <strong>control program</strong> role involves:",
        "options": [
          "Managing and distributing CPU time among competing processes",
          "Supervising program execution to prevent errors and improper hardware use",
          "Providing networking services to user applications",
          "Managing the file system on secondary storage"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "As a control program, the OS monitors what programs do, prevents them from accessing unauthorized memory or devices, and terminates or signals misbehaving processes."
      },
      {
        "type": "multiple-choice",
        "question": "What happens when a user program executes a <strong>system call</strong>?",
        "options": [
          "The CPU immediately transfers control to user mode and executes the requested operation",
          "A trap instruction switches the mode bit to kernel mode and transfers control to the OS",
          "The program is suspended and the OS restarts the computer",
          "The CPU bypasses the interrupt vector and executes I/O directly"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "A system call triggers a trap, which switches the mode bit to kernel mode and jumps to the OS's system call handler. The OS performs the requested service safely, then returns control to the user program in user mode."
      }
    ],
    "outline": [
      {
        "code": "1.1",
        "title": "What is an Operating System?",
        "pages": 4
      },
      {
        "code": "1.2",
        "title": "Computer System Structure",
        "pages": 3
      },
      {
        "code": "1.3",
        "title": "Interrupts & Computer Startup",
        "pages": 3
      },
      {
        "code": "1.4",
        "title": "Storage Hierarchy & Caching",
        "pages": 3
      },
      {
        "code": "1.5",
        "title": "Processes, Multiprogramming & Protection",
        "pages": 3
      }
    ]
  },
  "module2": {
    "number": "Module 2",
    "title": "Operating-System Structures",
    "summary": "Module 2 is all about how operating systems expose services, structure their kernels, debug problems, and boot.",
    "review": [
      {
        "title": "2.1 OS Services",
        "body": "<p class=\"lesson-topic-label\">User-Helpful OS Services</p>\n<p>The OS provides a rich set of services, which fall into two broad groups. The first group helps <strong>users and programs</strong> get their work done. The <strong>user interface</strong> can take three forms: a <strong>CLI (Command-Line Interface)</strong> where a shell interprets typed commands; a <strong>GUI (Graphical User Interface)</strong> using a desktop metaphor with mouse, keyboard, and icons (first developed at Xerox PARC, popularized by Apple and Microsoft); or a <strong>touchscreen</strong> interface using gestures and a virtual keyboard.</p>\n<p>Beyond the UI, the OS provides <strong>program execution</strong> — loading a program into memory and running it. It handles <strong>I/O operations</strong> on behalf of programs, since user programs cannot access hardware directly for safety reasons. It enables <strong>file-system manipulation</strong> — creating, deleting, reading, writing, searching, and listing files and directories. It supports <strong>inter-process communications (IPC)</strong> — letting processes exchange data either via <strong>shared memory</strong> (both processes access a common memory region) or <strong>message passing</strong> (the OS explicitly transfers data between processes). Finally, the OS performs <strong>error detection</strong>, monitoring hardware (memory errors, power failures) and software (arithmetic overflow, illegal memory access) and taking appropriate corrective action.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.1 OS Services",
        "body": "<p class=\"lesson-topic-label\">System-Efficiency OS Services</p>\n<p>The second group of OS services exists not to help individual users but to ensure <strong>efficient operation of the system as a whole</strong>. <strong>Resource allocation</strong> involves distributing CPU cycles, memory space, file storage, and I/O devices among multiple users or processes running simultaneously. The OS uses algorithms (CPU scheduling algorithms, memory allocation schemes) to optimize overall system performance.</p>\n<p><strong>Accounting</strong> tracks how much and what kind of resources each user or process consumes. This information can be used for billing (in commercial systems), system tuning, or understanding usage patterns. <strong>Protection</strong> ensures that concurrent processes cannot interfere with each other or with the OS — for example, preventing one process from reading another process's memory. <strong>Security</strong> defends the system from external threats — requiring user authentication (login), protecting devices from invalid access attempts, and recording intrusion attempts in audit logs.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.1 OS Services",
        "body": "<p class=\"lesson-topic-label\">The System-Call Interface as the OS Boundary</p>\n<p>The boundary between user programs and the OS is defined by the <strong>system-call interface</strong>. Every service the OS provides to user programs is accessed through this interface. Think of it as a set of entry points into the OS — the only legal ways a user-mode program can request kernel-mode services.</p>\n<p>System calls are distinct from ordinary function calls. When a user program calls a library function (e.g., <code>printf()</code>), that function may internally issue one or more system calls. The user program generally never sees or needs to know which system calls are being made — the <strong>Application Programming Interface (API)</strong> such as <strong>POSIX</strong> or <strong>Win32</strong> abstracts these details. This separation means application programs are portable across OS versions as long as the API remains consistent, even if the underlying system call numbers change.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.2 System Calls & Parameter Passing",
        "body": "<p class=\"lesson-topic-label\">What Is a System Call?</p>\n<p>A <strong>system call</strong> is the programming interface through which user programs formally request services from the OS kernel. System calls are typically written in <strong>C or C++</strong> and are the mechanism by which user-mode code legitimately transitions into kernel mode. Rather than invoking system calls directly (which would require knowing low-level call numbers and machine-specific instructions), programmers almost always access them through a higher-level <strong>Application Programming Interface (API)</strong>.</p>\n<p>The three most widely used APIs are: <strong>Win32</strong> (for Windows applications), <strong>POSIX</strong> (Portable Operating System Interface — used by UNIX, Linux, and macOS), and the <strong>Java API</strong> (for programs running on the Java Virtual Machine). Each of these APIs provides standard function calls that internally invoke the corresponding system calls, hiding the OS-specific details from the programmer and ensuring application portability.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.2 System Calls & Parameter Passing",
        "body": "<p class=\"lesson-topic-label\">System-Call Numbers &amp; the Interface Table</p>\n<p>Each system call in an OS is assigned a unique <strong>number</strong>. The <strong>system-call interface</strong> — maintained by the <strong>run-time environment (RTE)</strong>, which is the full suite of software needed to execute a compiled program — keeps a <strong>table indexed by these numbers</strong>. When a program invokes an API function, the RTE intercepts the call, looks up the corresponding system-call number, executes the appropriate <strong>trap instruction</strong>, and the OS routes execution to the correct kernel routine.</p>\n<p>This indirection is intentional: it decouples the API from the underlying kernel implementation. An OS can add, remove, or renumber system calls internally without breaking application programs as long as the API mapping layer is updated accordingly. The programmer does not need to know the number or implementation of any system call — only the API function signature.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.2 System Calls & Parameter Passing",
        "body": "<p class=\"lesson-topic-label\">Parameter Passing to System Calls</p>\n<p>When a user program makes a system call, it often needs to pass <strong>parameters</strong> to the OS (e.g., a filename to open, a buffer address for reading). There are three methods for passing these parameters:</p>\n<p><strong>(1) Registers</strong> — the simplest method: parameters are placed directly in CPU registers before the system call. Limited by the number of available registers, so only works for calls with few parameters.</p>\n<p><strong>(2) Memory block (table method)</strong> — parameters are stored in a block of memory, and the <strong>address</strong> of that block is passed in a single register. This is the approach used by <strong>Linux</strong> and <strong>Solaris</strong>. It removes the limit on the number of parameters.</p>\n<p><strong>(3) Stack</strong> — the program <strong>pushes</strong> parameters onto the call stack, and the OS <strong>pops</strong> them off during the system call. Like the block method, this handles an arbitrary number of parameters. Methods 2 and 3 are preferred when many parameters must be passed.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.3 Types of System Calls",
        "body": "<p class=\"lesson-topic-label\">Process Control &amp; File Management Calls</p>\n<p>System calls are grouped into <strong>six categories</strong> based on the class of OS service they access. The first two are:</p>\n<p><strong>Process Control</strong> calls manage the lifecycle and behavior of processes. They include: <strong>create process</strong> (fork a new process) and <strong>terminate process</strong> (end execution normally or abnormally); <strong>load</strong> and <strong>execute</strong> a program image; <strong>get and set process attributes</strong> (priority, name, etc.); <strong>allocate and free memory</strong> for a process; <strong>wait for an event</strong> or <strong>signal an event</strong>; and <strong>acquire and release locks</strong> to protect shared data from concurrent modification.</p>\n<p><strong>File Management</strong> calls handle files and directories. They include: <strong>create</strong> and <strong>delete</strong> files; <strong>open</strong> and <strong>close</strong> files (obtaining and releasing a file handle); <strong>read</strong>, <strong>write</strong>, and <strong>reposition</strong> (seek) within a file; and <strong>get and set file attributes</strong> such as name, type, protection bits, and creation date.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.3 Types of System Calls",
        "body": "<p class=\"lesson-topic-label\">Device Management, Information Maintenance &amp; Communications</p>\n<p><strong>Device Management</strong> calls control physical and virtual devices: <strong>request</strong> and <strong>release</strong> a device (exclusive access); <strong>read</strong>, <strong>write</strong>, and <strong>reposition</strong> device data; <strong>get and set device attributes</strong>; and <strong>logically attach or detach</strong> devices (e.g., mounting/unmounting a drive).</p>\n<p><strong>Information Maintenance</strong> calls manage system and process metadata: <strong>get and set time or date</strong>; <strong>get and set system data</strong> (OS version, memory available); and <strong>get and set attributes</strong> of processes, files, or devices.</p>\n<p><strong>Communications</strong> calls enable inter-process communication. The <strong>message-passing model</strong>: create and delete communication connections; send and receive messages between processes or across a network; transfer status information. The <strong>shared memory model</strong>: create and access a shared memory region that multiple processes can read and write directly — faster than message passing but requires synchronization. Processes can also attach and detach remote devices in a distributed setting.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.3 Types of System Calls",
        "body": "<p class=\"lesson-topic-label\">Protection Calls &amp; Real-World Examples</p>\n<p><strong>Protection</strong> calls control who can access what resources: <strong>set permissions</strong> on files or devices (e.g., read-only, execute); <strong>get permissions</strong>; <strong>allow or deny user access</strong> to specific resources; and manage user and group identities for access control purposes.</p>\n<p>In practice, a single user action may trigger dozens of system calls. For example, a simple shell command <code>cp file1.txt file2.txt</code> involves: opening <code>file1.txt</code> (file management), reading its contents (file management), creating <code>file2.txt</code> (file management), writing the data (file management), closing both files (file management), and reporting success to the shell (information maintenance / process control). High-level programming languages and APIs hide this complexity — the programmer writes <code>shutil.copy()</code> in Python and the OS handles the rest.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.4 OS Design Principles & Structure Types",
        "body": "<p class=\"lesson-topic-label\">Design Goals &amp; Policy vs Mechanism</p>\n<p>A foundational OS design principle is separating <strong>Policy</strong> (\"<em>what</em> will be done?\") from <strong>Mechanism</strong> (\"<em>how</em> to do it?\"). A <strong>mechanism</strong> implements a capability; a <strong>policy</strong> decides how that capability is applied. For example, a timer mechanism can enforce many different CPU scheduling policies. This separation makes the OS <strong>flexible</strong> — the same mechanisms can be reused with different policies without rewriting core code.</p>\n<p>OS designers must also balance competing goals. <strong>User goals</strong>: the OS should be convenient to use, easy to learn, reliable, safe, and fast. <strong>System goals</strong>: the OS should be easy to design, implement, and maintain, as well as flexible, error-free, and efficient. These goals often conflict — for instance, adding more safety checks (a user goal) may reduce efficiency (a system goal), and the design must find the right balance.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.4 OS Design Principles & Structure Types",
        "body": "<p class=\"lesson-topic-label\">Simple, Monolithic, Layered &amp; Microkernel Structures</p>\n<p>OS internal structure has evolved through several models:</p>\n<p><strong>Simple (MS-DOS):</strong> Monolithic and not modular — interfaces are not well separated, and device drivers share the same space as the kernel. Simple to build but fragile: a bug in any component can crash the whole system.</p>\n<p><strong>Monolithic (Original UNIX):</strong> Large kernel sitting below the system-call interface — file system, CPU scheduler, and memory manager all at one level. Fast (no inter-layer overhead) but difficult to maintain and extend.</p>\n<p><strong>Layered:</strong> The OS is divided into layers (Layer 0 = hardware, Layer N = user interface). Each layer only uses services from the layer directly below it, making debugging and verification systematic. Trade-off: each call must pass through many layers, adding <strong>overhead</strong>.</p>\n<p><strong>Microkernel (Mach):</strong> Moves most kernel functions — file systems, device drivers, protocol stacks — to <strong>user space</strong>. The kernel itself handles only minimal services: inter-process communication (IPC), basic memory protection, and basic CPU scheduling. Components communicate via <strong>message passing</strong>. Benefits: portable, reliable (a crash in a user-space service doesn't crash the kernel). Drawback: <strong>performance overhead</strong> from constant user-space ↔ kernel-space communication.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.4 OS Design Principles & Structure Types",
        "body": "<p class=\"lesson-topic-label\">Modular, Hybrid &amp; Virtual Machine Structures</p>\n<p><strong>Modular (Linux, Solaris):</strong> Uses <strong>Loadable Kernel Modules (LKMs)</strong> — object-oriented components with well-defined interfaces that can be dynamically loaded or unloaded at runtime. Flexible like a microkernel (add/remove functionality without rebooting) but faster (modules run in kernel space, no message-passing overhead). Linux's modular architecture is a primary reason for its wide adoption across platforms.</p>\n<p><strong>Hybrid:</strong> Most modern OSes combine approaches. <strong>Mac OS X (macOS)</strong> uses a Mach microkernel + BSD Unix personality layer + I/O kit + dynamically loadable modules. <strong>Android</strong> uses a Linux kernel + native C/C++ libraries + Android Runtime (ART) + application framework. Windows also uses a hybrid approach combining a microkernel-like architecture with extensive user-space services.</p>\n<p>A related concept is <strong>virtual machines (VMs)</strong>: software that emulates hardware so multiple OS instances can run simultaneously on the same physical machine. The <strong>Virtual Machine Monitor (VMM)</strong> or <strong>hypervisor</strong> manages the VMs. Examples: VMware, VirtualBox, KVM. VMs provide strong isolation and are widely used in cloud computing.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.5 System Programs, Debugging & Boot",
        "body": "<p class=\"lesson-topic-label\">System Programs &amp; Daemons</p>\n<p><strong>System programs</strong> (also called system utilities) provide a convenient environment for program development and execution. They sit above the kernel in the software stack but below typical application programs. Categories include:</p>\n<p><strong>Daemons</strong> are system programs that launch at <strong>boot time</strong> and run continuously in the background, waiting to perform work when needed. Examples: the print spooler daemon (queues print jobs), the network daemon (handles incoming connections), and the cron daemon (runs scheduled tasks). Daemons are fundamental to the event-driven nature of modern operating systems.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.5 System Programs, Debugging & Boot",
        "body": "<p class=\"lesson-topic-label\">Debugging &amp; Performance Analysis</p>\n<p><strong>Debugging</strong> is the process of finding and fixing errors (bugs) in software — both user programs and the OS itself. The OS supports debugging through several mechanisms:</p>\n<p><strong>Log files</strong> record system events, errors, and warnings over time — invaluable for diagnosing intermittent problems. When a <strong>user application</strong> crashes, the OS can save a <strong>core dump</strong> — a snapshot of the process's memory at the moment of the crash — which developers can analyze with a debugger to find the cause. When the <strong>OS itself</strong> crashes (a kernel panic or BSOD), the system saves a <strong>crash dump</strong> — a snapshot of kernel memory — for post-mortem analysis.</p>\n<p><strong>Profiling</strong> identifies performance bottlenecks by periodically sampling the program counter (instruction pointer) while a program runs. The profiler tallies where the CPU spends most of its time, revealing which functions or code paths consume the most resources.</p>\n<p><strong>DTrace</strong> (developed by Sun for Solaris, also available on FreeBSD and macOS) provides <strong>live dynamic instrumentation</strong> — inserting tracing probes into a running production system without stopping it or recompiling. This allows developers to diagnose performance problems in live environments that would be impossible to reproduce in a test setup.</p>\n<p>─────────────────────────────────</p>"
      },
      {
        "title": "2.5 System Programs, Debugging & Boot",
        "body": "<p class=\"lesson-topic-label\">System Boot</p>\n<p><strong>System boot</strong> is the sequence of steps that transforms a powered-off machine into a fully running OS. When power is applied, the CPU begins executing code at a fixed memory address — the location of the <strong>bootstrap loader</strong> (or <strong>bootloader</strong>), a small program stored in <strong>ROM or EEPROM</strong> (nonvolatile firmware). The bootstrap loader: 1. Performs a hardware self-test (POST — Power-On Self-Test) 2. Initializes hardware: CPU registers, device controllers, memory 3. Locates the OS kernel on secondary storage 4. Loads the kernel into main memory 5. Begins kernel execution</p>\n<p><strong>GRUB</strong> (GRand Unified Bootloader) is a widely used open-source bootloader for Linux systems. It presents a menu at boot time allowing the user to choose from multiple installed operating systems or kernel versions — useful for dual-booting or system recovery.</p>\n<p><strong>SYSGEN</strong> (System Generation) is the process of configuring a kernel build for a specific hardware configuration. The SYSGEN program collects information about the target hardware and produces a tailored kernel — including only the drivers and modules needed for that machine — optimizing size and performance.</p>\n<p>─────────────────────────────────</p>"
      }
    ],
    "quizType": "multiple-choice",
    "quiz": [
      {
        "type": "multiple-choice",
        "question": "Which of the following is a <strong>user-helpful</strong> OS service (not a system-efficiency service)?",
        "options": [
          "Resource allocation",
          "Accounting",
          "Inter-process communication (IPC)",
          "Protection"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "IPC helps user programs communicate with each other. Resource allocation, accounting, and protection are system-efficiency services that benefit the overall operation of the system rather than directly assisting individual users."
      },
      {
        "type": "multiple-choice",
        "question": "What is the purpose of a <strong>system call</strong>?",
        "options": [
          "To allow device controllers to signal the CPU when I/O is complete",
          "To provide user programs with a formal interface to request OS kernel services",
          "To load the operating system kernel into memory at boot time",
          "To cache frequently used data from disk into main memory"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "A system call is the mechanism by which user-mode programs request services from the OS. It is the only legal way to transition from user mode to kernel mode to access protected OS functions."
      },
      {
        "type": "multiple-choice",
        "question": "Which of the following is the <strong>parameter passing method</strong> used by Linux and Solaris for system calls?",
        "options": [
          "Passing all parameters directly in CPU registers",
          "Pushing parameters onto the program stack for the OS to pop",
          "Storing parameters in a memory block and passing the block's address in a register",
          "Embedding parameters directly in the system call instruction"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "Linux and Solaris use the memory block (table) method: parameters are written to a memory block, and the address of that block is passed in one register. This supports an arbitrary number of parameters."
      },
      {
        "type": "multiple-choice",
        "question": "The <strong>Win32</strong>, <strong>POSIX</strong>, and <strong>Java</strong> APIs are all examples of:",
        "options": [
          "System call numbers used by different operating systems",
          "High-level Application Programming Interfaces that abstract system calls for developers",
          "Types of bootloaders used to initialize the OS",
          "Kernel structures used to manage process scheduling"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "These APIs provide portable, programmer-friendly function libraries that internally translate to OS-specific system calls. They shield programmers from needing to know machine-specific system call numbers or instructions."
      },
      {
        "type": "multiple-choice",
        "question": "Which category of system calls would you use to <strong>create a new process</strong>?",
        "options": [
          "File management",
          "Device management",
          "Process control",
          "Information maintenance"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "Process control system calls handle the creation, termination, execution, and management of processes. Creating a new process (e.g., via <code>fork()</code> in POSIX) is a process control operation."
      },
      {
        "type": "multiple-choice",
        "question": "What is the key design principle of separating <strong>Policy from Mechanism</strong> in OS design?",
        "options": [
          "The OS should use two separate kernels — one for policy and one for mechanism",
          "The policy (what is done) and mechanism (how to do it) are separated so policies can change without rewriting core mechanisms",
          "All OS mechanisms must be implemented in hardware; policies are software only",
          "Only microkernel OSes use mechanisms; monolithic OSes use policies"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Separating policy from mechanism allows flexibility: you can change what the OS does (policy) — such as a new scheduling algorithm — without modifying how it does it (mechanism), making the OS far easier to maintain and adapt."
      },
      {
        "type": "multiple-choice",
        "question": "Which OS structure type moves most kernel functions to <strong>user space</strong> and uses <strong>message passing</strong> for communication between components?",
        "options": [
          "Monolithic",
          "Layered",
          "Microkernel",
          "Simple (MS-DOS-style)"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "The microkernel approach (e.g., Mach) keeps only minimal services in the kernel (IPC, basic memory, basic scheduling) and moves everything else — file systems, drivers, network stacks — to user space. Components communicate via message passing."
      },
      {
        "type": "multiple-choice",
        "question": "What is the <strong>primary advantage</strong> of a microkernel OS architecture?",
        "options": [
          "Maximum performance due to everything running in kernel space",
          "Easier portability and reliability since most services run in user space",
          "Simpler design because no message passing is required",
          "Faster I/O because the kernel directly controls all device drivers"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Running OS services in user space means a crash in any one service doesn't crash the entire kernel. The smaller kernel is also easier to port to new hardware. The trade-off is performance overhead from the user↔kernel message passing required."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>Loadable Kernel Modules (LKMs)</strong>, used by Linux and Solaris, provide which benefit?",
        "options": [
          "They allow user programs to bypass the system-call interface",
          "They enable OS functionality to be added or removed at runtime without rebooting",
          "They replace the kernel entirely with user-space services",
          "They cache recently executed code for faster system call performance"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "LKMs are object-oriented kernel components with well-defined interfaces that can be dynamically loaded or unloaded while the OS is running. This gives the flexibility of a microkernel while keeping the performance of kernel-space execution."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>Mac OS X (macOS)</strong> is best described as which type of OS structure?",
        "options": [
          "Simple (MS-DOS-style)",
          "Pure microkernel",
          "Pure monolithic",
          "Hybrid (Mach microkernel + BSD Unix layer + I/O kit + loadable modules)"
        ],
        "answer": 3,
        "correctLabel": "D",
        "explanation": "macOS is a hybrid OS combining a Mach microkernel, a BSD Unix personality (for POSIX compatibility), an I/O kit for device drivers, and dynamically loadable kernel modules — taking elements from multiple architectural approaches."
      },
      {
        "type": "multiple-choice",
        "question": "What is a <strong>daemon</strong> in operating system terminology?",
        "options": [
          "A debugging tool that profiles CPU usage in real time",
          "A system program that launches at boot time and runs continuously in the background",
          "A kernel module that handles hardware interrupts",
          "A type of system call used for file management"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Daemons are background processes started at boot time. They wait for events and provide services (e.g., handling print jobs, incoming network connections, scheduled tasks) without direct user interaction."
      },
      {
        "type": "multiple-choice",
        "question": "What is a <strong>core dump</strong>, and when is it generated?",
        "options": [
          "A backup of the OS kernel saved to disk during a scheduled maintenance cycle",
          "A memory snapshot of a crashed application, saved for post-mortem debugging",
          "A log file recording all system calls made by a process",
          "A compressed archive of all files deleted by a user process"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "When a user application crashes, the OS can save the process's memory state — its registers, stack, heap, and code — as a core dump. Developers use debuggers to analyze core dumps and find the root cause of the crash."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>Profiling</strong> as a debugging technique works by:",
        "options": [
          "Logging every system call made by a process in order",
          "Periodically sampling the instruction pointer to identify which code uses the most CPU time",
          "Comparing two versions of the same program to find differences",
          "Inserting checkpoints into kernel code to measure interrupt latency"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "Profiling samples the program counter at frequent intervals while a program runs. By tallying where execution time is spent, it reveals performance bottlenecks — the functions or loops that consume the most CPU cycles."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>DTrace</strong> differs from traditional debugging tools because it:",
        "options": [
          "Only works on crashed systems to recover lost data",
          "Provides live dynamic instrumentation on running production systems without recompiling or restarting",
          "Is a static analysis tool that detects bugs before compilation",
          "Replaces the OS kernel with a debugging version during analysis"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "DTrace inserts tracing probes dynamically into a live running system, allowing developers to observe OS and application behavior in real time without stopping the system — critical for diagnosing problems that only occur under production load."
      },
      {
        "type": "multiple-choice",
        "question": "What is the correct sequence of the <strong>system boot process</strong>?",
        "options": [
          "Load kernel → POST → Initialize hardware → Bootstrap loader runs",
          "Bootstrap loader runs → POST → Initialize hardware → Load kernel",
          "Power on → POST → Bootstrap loader runs → Initialize hardware → Load kernel → Kernel starts",
          "Power on → Load kernel → Bootstrap loader runs → POST"
        ],
        "answer": 2,
        "correctLabel": "C",
        "explanation": "The boot sequence: power on → POST (hardware self-test) → bootstrap loader runs (from ROM/EEPROM) → initializes hardware → locates and loads the OS kernel into memory → kernel starts executing."
      },
      {
        "type": "multiple-choice",
        "question": "<strong>GRUB</strong> (GRand Unified Bootloader) is used for:",
        "options": [
          "Generating a tailored kernel image for a specific hardware configuration",
          "Providing a menu at boot time to select from multiple kernels or operating systems",
          "Managing loadable kernel modules during normal OS operation",
          "Performing hardware diagnostics before the OS starts"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "GRUB is a bootloader that presents a selection menu at startup, allowing users to choose which OS or kernel version to boot. It is widely used in Linux systems and supports dual-booting multiple operating systems."
      },
      {
        "type": "multiple-choice",
        "question": "What does <strong>SYSGEN</strong> do?",
        "options": [
          "It generates system call numbers for a new OS version",
          "It configures and builds a kernel image tailored for specific hardware",
          "It creates daemon processes at boot time",
          "It initializes device drivers when new hardware is detected"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "SYSGEN (System Generation) collects information about the target hardware configuration and produces a customized kernel that includes only the necessary components (drivers, modules) for that system, optimizing size and performance."
      },
      {
        "type": "multiple-choice",
        "question": "Which system call category handles <strong>getting and setting file permissions</strong>?",
        "options": [
          "File management",
          "Information maintenance",
          "Device management",
          "Protection"
        ],
        "answer": 3,
        "correctLabel": "D",
        "explanation": "Protection system calls control resource access rights. Getting and setting permissions (e.g., <code>chmod</code> in POSIX) determines who can read, write, or execute a file — this is a protection operation."
      },
      {
        "type": "multiple-choice",
        "question": "In the <strong>layered OS structure</strong>, what is the defining rule for how layers interact?",
        "options": [
          "Each layer can call any other layer directly to maximize performance",
          "Each layer can only use services provided by the layer immediately below it",
          "Layers communicate via message passing through the microkernel",
          "The top layer (hardware) provides services to all layers above it"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "In a layered structure, each layer is built on top of and only uses services from the layer directly below. This strict ordering makes the OS easier to debug (each layer can be verified independently) but adds overhead as calls must traverse each layer."
      },
      {
        "type": "multiple-choice",
        "question": "What is the <strong>shared memory model</strong> of inter-process communication?",
        "options": [
          "The OS copies messages from one process's memory to another process's memory",
          "Multiple processes create and access a common memory region that all can read and write directly",
          "The kernel acts as an intermediary routing messages between processes",
          "Processes share their CPU registers to exchange data"
        ],
        "answer": 1,
        "correctLabel": "B",
        "explanation": "In the shared memory model, processes establish a region of memory that multiple processes can access directly. This is faster than message passing (no copying by the OS) but requires explicit synchronization to prevent race conditions."
      }
    ],
    "outline": [
      {
        "code": "2.1",
        "title": "OS Services",
        "pages": 4
      },
      {
        "code": "2.2",
        "title": "System Calls & Parameter Passing",
        "pages": 3
      },
      {
        "code": "2.3",
        "title": "Types of System Calls",
        "pages": 3
      },
      {
        "code": "2.4",
        "title": "OS Design Principles & Structure Types",
        "pages": 3
      },
      {
        "code": "2.5",
        "title": "System Programs, Debugging & Boot",
        "pages": 3
      }
    ]
  }
};
