/// mesh-llm futures overflow tokio's default 2 MiB stacks; use 8 MiB.
pub fn install_mesh_worker_runtime() {
    #[cfg(feature = "mesh-llm")]
    match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(crate::mesh_llm::MESH_WORKER_STACK_SIZE)
        .build()
    {
        Ok(runtime) => {
            tauri::async_runtime::set(runtime.handle().clone());
            std::mem::forget(runtime);
            eprintln!(
                "buzz-mesh: installed tokio runtime with {} MiB worker stacks",
                crate::mesh_llm::MESH_WORKER_STACK_SIZE / (1024 * 1024)
            );
        }
        Err(error) => {
            eprintln!("buzz-mesh: failed to build big-stack tokio runtime, using default: {error}");
        }
    }
}
