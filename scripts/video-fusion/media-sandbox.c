/* Linux-only FFmpeg launcher. The service has no business mounts or credentials.
 * Each child sees only a read-only runtime and its own authorized media copies. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>

static void fail(const char *stage) { perror(stage); exit(125); }
static void limit(int resource, rlim_t value) {
  struct rlimit cap = {value, value}; if (setrlimit(resource, &cap)) fail("rlimit");
}
#define DENY(nr) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,(nr),0,1), BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM)
static void forbid_network_and_privilege(void) {
#if defined(__x86_64__)
  const unsigned int arch = AUDIT_ARCH_X86_64;
#elif defined(__aarch64__)
  const unsigned int arch = AUDIT_ARCH_AARCH64;
#else
#error Unsupported media sandbox architecture
#endif
  struct sock_filter rules[] = {
    BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
    BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,arch,1,0),
    BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
#if defined(__x86_64__)
    BPF_JUMP(BPF_JMP|BPF_JGE|BPF_K,0x40000000,0,1),
    BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
#endif
    DENY(SYS_socket), DENY(SYS_connect), DENY(SYS_bind), DENY(SYS_listen),
    DENY(SYS_ptrace), DENY(SYS_mount), DENY(SYS_umount2), DENY(SYS_chroot),
    DENY(SYS_unshare), DENY(SYS_setns), DENY(SYS_open_by_handle_at),
    BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
  };
  struct sock_fprog policy = {(unsigned short)(sizeof(rules)/sizeof(rules[0])),rules};
  if (prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)) fail("no-new-privileges");
  if (prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&policy)) fail("seccomp");
}
int main(int argc,char **argv) {
  if (argc<5 || getuid()!=0) return 125;
  const char *prefix="/tmp/naumi-media-sandbox/";
  if (strncmp(argv[1],prefix,strlen(prefix)) || strstr(argv[1],"..") ||
      strspn(argv[1]+strlen(prefix),"0123456789abcdef-")!=strlen(argv[1]+strlen(prefix))) return 125;
  char *end=NULL; long uid=strtol(argv[2],&end,10);
  if (!end || *end || uid<10000 || uid>60000) return 125;
  const char *binary = !strcmp(argv[3],"ffmpeg") ? "/usr/bin/ffmpeg" :
                       !strcmp(argv[3],"ffprobe") ? "/usr/bin/ffprobe" : NULL;
  if (!binary) return 125;
  limit(RLIMIT_CPU,180); limit(RLIMIT_FSIZE,500UL*1024*1024);
  limit(RLIMIT_AS,2UL*1024*1024*1024); limit(RLIMIT_NOFILE,128); limit(RLIMIT_NPROC,64);
  limit(RLIMIT_CORE,0);
  if (chroot(argv[1]) || chdir("/work")) fail("chroot");
  if (setgroups(0,NULL) || setgid((gid_t)uid) || setuid((uid_t)uid)) fail("drop-user");
  forbid_network_and_privilege();
  char *environment[]={"PATH=/usr/bin","LANG=C","HOME=/work","TMPDIR=/work",NULL};
  argv[3]=(char *)binary;
  execve(binary,&argv[3],environment); fail("exec");
  return 125;
}
