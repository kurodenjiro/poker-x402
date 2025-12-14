const fs = require('fs');
const path = require('path');

// Ensure public/idl directory exists (remove any symlinks first)
const publicIdlDir = path.join(process.cwd(), 'public', 'idl');

// Always ensure the directory exists with proper permissions
try {
  if (fs.existsSync(publicIdlDir)) {
    // Check if it's a symlink
    const stat = fs.lstatSync(publicIdlDir);
    if (stat.isSymbolicLink()) {
      // Remove symlink and create real directory
      fs.unlinkSync(publicIdlDir);
      fs.mkdirSync(publicIdlDir, { recursive: true, mode: 0o755 });
      console.log('Removed symlink and created directory:', publicIdlDir);
    } else {
      // Remove any symlinks inside the directory
      try {
        const entries = fs.readdirSync(publicIdlDir);
        for (const entry of entries) {
          const entryPath = path.join(publicIdlDir, entry);
          try {
            const entryStat = fs.lstatSync(entryPath);
            if (entryStat.isSymbolicLink()) {
              fs.unlinkSync(entryPath);
              console.log(`Removed symlink: ${entryPath}`);
            }
          } catch (err) {
            // Ignore errors
          }
        }
      } catch (err) {
        // If can't read, recreate directory
        fs.rmSync(publicIdlDir, { recursive: true, force: true });
        fs.mkdirSync(publicIdlDir, { recursive: true, mode: 0o755 });
      }
    }
  } else {
    // Create directory with proper permissions
    fs.mkdirSync(publicIdlDir, { recursive: true, mode: 0o755 });
    console.log('Created directory:', publicIdlDir);
  }
} catch (err) {
  console.error('Error setting up public/idl directory:', err);
  // Try one more time with force
  try {
    fs.mkdirSync(publicIdlDir, { recursive: true, mode: 0o755 });
  } catch (finalErr) {
    console.error('Failed to create directory:', finalErr);
    process.exit(1);
  }
}

// Copy IDL file from contracts/target/idl to public/idl
const sourceIdlPath = path.join(process.cwd(), 'contracts', 'target', 'idl', 'poker_betting.json');
const targetIdlPath = path.join(publicIdlDir, 'poker_betting.json');

if (fs.existsSync(sourceIdlPath)) {
  fs.copyFileSync(sourceIdlPath, targetIdlPath);
  console.log('✅ Copied IDL file to public/idl/poker_betting.json');
} else {
  // Fallback: try public/target/idl
  const fallbackSource = path.join(process.cwd(), 'public', 'target', 'idl', 'poker_betting.json');
  if (fs.existsSync(fallbackSource)) {
    fs.copyFileSync(fallbackSource, targetIdlPath);
    console.log('✅ Copied IDL file from public/target/idl to public/idl/poker_betting.json');
  } else {
    console.warn('⚠️  IDL file not found. Expected at:', sourceIdlPath, 'or', fallbackSource);
    console.warn('⚠️  The build will continue, but the IDL must be available at runtime.');
  }
}
