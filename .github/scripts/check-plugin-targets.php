<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

/**
 * Checks that every interception plugin declared by the Hyperion modules
 * targets a method that exists.
 *
 * Magento wires a plugin method by name only: `afterFoo()` on a type that has
 * no public `foo()` is accepted by `setup:di:compile` and simply never runs.
 * For every `<type name="T"><plugin type="P"/></type>` of every `di.xml` under
 * `app/code/Magentofullstackdev/<Module>/etc/` (all areas) this script reflects
 * `P` and requires, for each public `before<X>`, `after<X>` or `around<X>`
 * method, a public, non-static, non-final method `lcfirst(<X>)` on `T`.
 *
 * Usage: php check-plugin-targets.php <magento-root> <repository-root>
 *
 * Only Composer's autoloader of the Magento project is loaded (no framework
 * bootstrap). The Hyperion classes are read from the repository, whatever
 * copy the project has installed under `vendor/`.
 *
 * Output: one line per miss (`P::method -> T has no method x`), `WARNING`
 * lines for targets of optional modules that are not installed, and lines
 * starting with `OK` for good news only. Exit code 1 on any miss, 2 on a
 * usage error, 0 otherwise.
 */

const HYPERION_VENDOR_DIR = 'app/code/Magentofullstackdev';
const HYPERION_NAMESPACE = 'Magentofullstackdev\\';

/**
 * @return never
 */
function usageError(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    fwrite(STDERR, 'Usage: php check-plugin-targets.php <magento-root> <repository-root>' . PHP_EOL);
    exit(2);
}

/**
 * Composer package name a Magento style class name most likely belongs to
 * (`Magento\LoginAsCustomer\...` gives `magento/module-login-as-customer`).
 */
function packageOfClass(string $class): string
{
    $parts = explode('\\', ltrim($class, '\\'));
    if (count($parts) < 2) {
        return '';
    }
    $kebab = static fn (string $name): string => strtolower((string) preg_replace('/(?<=[a-z0-9])(?=[A-Z])/', '-', $name));
    $vendor = $parts[0] === 'MageOS' ? 'mage-os' : strtolower($parts[0]);

    return $vendor . '/module-' . $kebab($parts[1]);
}

/**
 * @param array<string, mixed> $suggest
 */
function isSuggested(string $class, array $suggest): bool
{
    $package = packageOfClass($class);
    if ($package === '') {
        return false;
    }
    foreach (array_keys($suggest) as $name) {
        // A sub-module of a suggested module is optional too (module-foo-ui next to module-foo).
        if ($package === $name || str_starts_with($package, $name . '-')) {
            return true;
        }
    }

    return false;
}

if ($argc !== 3) {
    usageError('Two arguments are required.');
}
$magentoRoot = rtrim($argv[1], '/');
$repoRoot = rtrim($argv[2], '/');
$autoload = $magentoRoot . '/vendor/autoload.php';
$modulesDir = $repoRoot . '/' . HYPERION_VENDOR_DIR;
if (!is_file($autoload)) {
    usageError(sprintf('No Composer autoloader at %s.', $autoload));
}
if (!is_dir($modulesDir)) {
    usageError(sprintf('No module directory at %s.', $modulesDir));
}

/** @var \Composer\Autoload\ClassLoader $loader */
$loader = require $autoload;

$moduleDirs = glob($modulesDir . '/*', GLOB_ONLYDIR) ?: [];
foreach ($moduleDirs as $moduleDir) {
    // Prepended: the repository's classes win over an installed copy of the same package.
    $loader->addPsr4(HYPERION_NAMESPACE . basename($moduleDir) . '\\', $moduleDir . '/', true);
}
// Generated classes (factories, proxies) a plugin may extend or implement.
if (is_dir($magentoRoot . '/generated/code')) {
    $loader->addPsr4('', $magentoRoot . '/generated/code/');
}

$errors = [];
$warnings = [];
$declarations = 0;
$methodsChecked = 0;
$files = 0;

foreach ($moduleDirs as $moduleDir) {
    $diFiles = array_merge(
        glob($moduleDir . '/etc/di.xml') ?: [],
        glob($moduleDir . '/etc/*/di.xml') ?: []
    );
    if ($diFiles === []) {
        continue;
    }
    $manifest = json_decode((string) @file_get_contents($moduleDir . '/composer.json'), true);
    $suggest = is_array($manifest) && is_array($manifest['suggest'] ?? null) ? $manifest['suggest'] : [];

    foreach ($diFiles as $diFile) {
        $files++;
        $relative = substr($diFile, strlen($repoRoot) + 1);
        $xml = simplexml_load_file($diFile);
        if ($xml === false) {
            $errors[] = sprintf('%s is not readable XML', $relative);
            continue;
        }

        $virtualTypes = [];
        foreach ($xml->virtualType as $virtualType) {
            $virtualTypes[ltrim((string) $virtualType['name'], '\\')] = ltrim((string) $virtualType['type'], '\\');
        }

        foreach ($xml->type as $type) {
            $target = ltrim((string) $type['name'], '\\');
            foreach ($type->plugin as $plugin) {
                $pluginClass = ltrim((string) $plugin['type'], '\\');
                if ((string) $plugin['disabled'] === 'true' || $pluginClass === '') {
                    continue;
                }
                $declarations++;
                $pluginClass = $virtualTypes[$pluginClass] ?? $pluginClass;

                try {
                    $pluginReflection = new ReflectionClass($pluginClass);
                } catch (Throwable $e) {
                    $errors[] = sprintf(
                        '%s: plugin class %s cannot be loaded (%s)',
                        $relative,
                        $pluginClass,
                        $e->getMessage()
                    );
                    continue;
                }

                try {
                    $targetReflection = new ReflectionClass($target);
                } catch (Throwable $e) {
                    $message = sprintf(
                        '%s: target %s of %s cannot be loaded (%s)',
                        $relative,
                        $target,
                        $pluginClass,
                        $e->getMessage()
                    );
                    if (isSuggested($target, $suggest)) {
                        $warnings[] = $message . ', its module is optional';
                    } else {
                        $errors[] = $message;
                    }
                    continue;
                }

                foreach ($pluginReflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                    if (!preg_match('/^(?:before|after|around)([A-Z_].*)$/', $method->getName(), $match)) {
                        continue;
                    }
                    $methodsChecked++;
                    $wanted = lcfirst($match[1]);
                    $reason = null;
                    if (!$targetReflection->hasMethod($wanted)
                        || $targetReflection->getMethod($wanted)->getName() !== $wanted
                    ) {
                        $reason = sprintf('has no method %s', $wanted);
                    } else {
                        $targetMethod = $targetReflection->getMethod($wanted);
                        if (!$targetMethod->isPublic()) {
                            $reason = sprintf('has no public method %s', $wanted);
                        } elseif ($targetMethod->isStatic() || $targetMethod->isFinal()) {
                            $reason = sprintf('has a static or final method %s, which cannot be intercepted', $wanted);
                        }
                    }
                    if ($reason !== null) {
                        $errors[] = sprintf('%s::%s -> %s %s', $pluginClass, $method->getName(), $target, $reason);
                    }
                }
            }
        }
    }
}

foreach ($warnings as $warning) {
    echo 'WARNING ' . $warning . PHP_EOL;
}
foreach ($errors as $error) {
    echo $error . PHP_EOL;
}
if ($errors !== []) {
    echo sprintf(
        'FAILED %d plugin target problem(s) in %d plugin declaration(s) of %d di.xml file(s)',
        count($errors),
        $declarations,
        $files
    ) . PHP_EOL;
    exit(1);
}
if ($declarations === 0) {
    echo 'FAILED no plugin declaration found, wrong repository root?' . PHP_EOL;
    exit(1);
}
echo sprintf(
    'OK %d plugin method(s) of %d plugin declaration(s) in %d di.xml file(s) target an existing method',
    $methodsChecked,
    $declarations,
    $files
) . PHP_EOL;
exit(0);
