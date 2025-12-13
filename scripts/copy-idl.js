const fs = require('fs');
const path = require('path');

// Ensure public/idl directory exists (remove any symlinks first)
const publicIdlDir = path.join(process.cwd(), 'public', 'idl');
if (fs.existsSync(publicIdlDir)) {
  // Remove any symlinks in the directory
  try {
    const entries = fs.readdirSync(publicIdlDir);
    for (const entry of entries) {
      const entryPath = path.join(publicIdlDir, entry);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(entryPath);
          console.log(`Removed symlink: ${entryPath}`);
        }
      } catch (err) {
        // Ignore errors
      }
    }
  } catch (err) {
    // If directory doesn't exist or can't be read, create it
    fs.mkdirSync(publicIdlDir, { recursive: true });
  }
} else {
  fs.mkdirSync(publicIdlDir, { recursive: true });
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
