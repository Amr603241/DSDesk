using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;
using System.Linq;
using System.Windows.Forms;

// --- Professional Metadata (Certified & Reliable) ---
[assembly: AssemblyTitle("DSDesk Professional Final")]
[assembly: AssemblyDescription("Remote Control Client Wrapper")]
[assembly: AssemblyCompany("DSDesk Team")]
[assembly: AssemblyProduct("DSDesk")]
[assembly: AssemblyCopyright("Copyright © 2026 DSDesk Team")]
[assembly: AssemblyVersion("2.1.0.0")]
[assembly: AssemblyFileVersion("2.1.0.0")]

namespace DSDeskBootstrapper
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                // Step 1: Establish stable temp path
                string tempRoot = Path.Combine(Path.GetTempPath(), "DSDesk_Client_Final");
                if (!Directory.Exists(tempRoot)) Directory.CreateDirectory(tempRoot);

                // Step 2: Extract 7za tool
                string sevenZipPath = Path.Combine(tempRoot, "7za.exe");
                if (!ExtractResourceByMatch("7za.exe", sevenZipPath)) {
                    MessageBox.Show("Security Initialization Failed: Extraction Engine (7za) was not found in the package.", "Client Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // Step 3: Extract Main Payload
                string payloadPath = Path.Combine(tempRoot, "DSDesk_Source.zip");
                if (!ExtractResourceByMatch("DSDesk_Source.zip", payloadPath)) {
                    MessageBox.Show("Security Initialization Failed: Application Payload (ZIP) missing from master package.", "Client Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // Step 4: Robust Extraction with File Check
                Console.WriteLine("Preparing assets...");
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = sevenZipPath;
                psi.Arguments = string.Format("x \"{0}\" -o\"{1}\" -y", payloadPath, tempRoot);
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                
                using (Process p = Process.Start(psi)) {
                    p.WaitForExit();
                }

                string finalExe = Path.Combine(tempRoot, "DSDesk.exe");
                if (File.Exists(finalExe)) {
                    Process.Start(finalExe);
                } else {
                    MessageBox.Show("Security Initialization Failed: The main module (DSDesk.exe) could not be extracted correctly. Access Denied or Temp Full.", "Runtime Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Critical Bootstrapper Failure: " + ex.Message, "System Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        /// <summary>
        /// Dynamic resource extraction that finds the resource even if prefixed or namespaced
        /// </summary>
        static bool ExtractResourceByMatch(string fileName, string outputPath)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            string[] rawNames = asm.GetManifestResourceNames();
            
            // Try exact match first, then partial match
            string actualName = rawNames.FirstOrDefault(n => n.Equals(fileName, StringComparison.OrdinalIgnoreCase))
                             ?? rawNames.FirstOrDefault(n => n.EndsWith(fileName, StringComparison.OrdinalIgnoreCase));

            if (string.IsNullOrEmpty(actualName)) return false;

            try {
                using (Stream stream = asm.GetManifestResourceStream(actualName))
                {
                    if (stream == null) return false;
                    using (FileStream fileStream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        stream.CopyTo(fileStream);
                    }
                }
                return File.Exists(outputPath);
            } catch {
                return false;
            }
        }
    }
}
