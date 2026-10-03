function n(e,r=40){return e&&e.size>r*1024*1024?`"${e.name}" (${(e.size/1048576).toFixed(1)} MB) exceeds the ${r} MB per-file upload limit.`:null}export{n as f};
